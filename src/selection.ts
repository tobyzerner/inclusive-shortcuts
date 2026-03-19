import type { ShortcutPlugin, Shortcuts } from './core';
import {
    activeElementWithinRoot,
    elementsInRoot,
    isVisibleTarget,
    targetElement,
} from './dom';

const DEFAULT_SELECTION_ATTRIBUTE = 'data-shortcut-selection-default';
const SELECTION_VISIBLE_ATTRIBUTE = 'data-shortcut-selection-visible';
const ITEM_KEY_ATTRIBUTE = 'data-shortcut-selection-key';
const PRIMARY_SELECTION_ATTRIBUTE = 'data-shortcut-selection-primary';
const OWNER_ATTRIBUTE = 'data-shortcut-selection-owner';
const LIVE_REGION_ATTRIBUTE = 'data-shortcut-selection-status';
const SELECTED_ATTRIBUTE = 'data-shortcut-selected';
const ITEM_SELECTOR = `[${ITEM_KEY_ATTRIBUTE}]`;
const OWNED_SELECTOR = `[${OWNER_ATTRIBUTE}]`;

type SelectionMutationOptions = {
    visible?: boolean;
    announce?: 'always' | 'changed';
    emit?: boolean;
    refreshHost?: boolean;
};

export type SelectionOverflowContext = {
    edge: 'first' | 'last';
    current?: HTMLElement;
    host: Shortcuts;
};

export type SelectionContext = {
    item: HTMLElement;
    host: Shortcuts;
};

export type SelectionOptions = {
    storageKey?: string;
    onSelect?: (context: SelectionContext) => void;
    onOverflow?: (context: SelectionOverflowContext) => boolean;
};

export function createSelectionPlugin(
    options: SelectionOptions = {}
): SelectionPlugin {
    return new SelectionPlugin(options);
}

export class SelectionPlugin implements ShortcutPlugin {
    private host?: Shortcuts;
    private liveRegion?: HTMLElement;
    private managedFocusFallbackElement?: HTMLElement;
    private isRefreshingHost = false;
    private readonly selectedItemKey: SessionStateValue<string>;
    private readonly selectionVisible: SessionStateValue<boolean>;

    constructor(private readonly options: SelectionOptions = {}) {
        this.selectedItemKey = createSessionStateValue(
            () => this.selectionStateKey(),
            (value) => value,
            (value) => value
        );
        this.selectionVisible = createSessionStateValue(
            () => this.selectionVisibilityKey(),
            (value) => value === '1',
            () => '1',
            false
        );
    }

    connect(host: Shortcuts) {
        this.host = host;
        this.liveRegion = createLiveRegion();

        document.addEventListener('click', this.onDocumentClick, true);

        return () => {
            document.removeEventListener('click', this.onDocumentClick, true);

            if (this.host) {
                clearSelectionMarker(this.host.root);
                this.host.root.removeAttribute(SELECTION_VISIBLE_ATTRIBUTE);
            }

            this.clearManagedFocusFallback();
            clearLiveRegion(this.liveRegion);
            this.liveRegion?.remove();
            this.liveRegion = undefined;
            this.selectedItemKey.reset();
            this.selectionVisible.reset(false);
            this.host = undefined;
        };
    }

    refresh() {
        this.selectedItemKey.rehydrate();
        this.selectionVisible.rehydrate();

        const items = this.items();
        const selection =
            this.storedSelection(items) ||
            this.focusSelection(items, document.activeElement) ||
            this.defaultSelection(items);

        if (!this.host) {
            return;
        }

        if (selection) {
            this.applySelection(selection, {
                emit: false,
                refreshHost: false,
                visible:
                    selection.getAttribute(ITEM_KEY_ATTRIBUTE) ===
                    this.selectedItemKey.get()
                        ? this.selectionVisible.get() ?? false
                        : false,
            });
            return;
        }

        this.clearSelectionState(false);
    }

    scopeRoots() {
        if (!this.host) {
            return [];
        }

        const selection = this.selected();

        if (!selection) {
            return [];
        }

        return [
            {
                scope: 'selection',
                roots: [
                    selection,
                    ...externalControls(
                        this.host.root,
                        selection.getAttribute(ITEM_KEY_ATTRIBUTE) || undefined
                    ),
                ],
            },
        ];
    }

    items() {
        if (!this.host) {
            return [];
        }

        return Array.from(
            this.host.root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)
        ).filter((item) => isVisibleTarget(item));
    }

    selected(): HTMLElement | undefined {
        const items = this.items();

        return (
            this.storedSelection(items) ||
            this.focusSelection(items) ||
            this.defaultSelection(items)
        );
    }

    reset() {
        if (!this.host) {
            return false;
        }

        const currentSelection = this.selected();
        const defaultSelection = this.defaultSelection();

        if (!defaultSelection) {
            this.clearSelectionState();
            return !!currentSelection;
        }

        clearLiveRegion(this.liveRegion);
        this.applySelection(defaultSelection, { visible: false });

        return currentSelection !== defaultSelection;
    }

    show() {
        const selection = this.selected();

        if (!selection) {
            return false;
        }

        return this.applySelection(selection, { emit: false, visible: true });
    }

    next() {
        return this.moveSelection(1);
    }

    previous() {
        return this.moveSelection(-1);
    }

    first() {
        return this.navigate(this.boundaryItem(this.items(), 1));
    }

    last() {
        return this.navigate(this.boundaryItem(this.items(), -1));
    }

    select(itemOrKey?: HTMLElement | string) {
        const selection = this.resolveItem(itemOrKey);

        if (!selection) {
            return false;
        }

        return this.applySelection(selection, { announce: 'changed' });
    }

    navigate(itemOrKey?: HTMLElement | string) {
        const selection = this.resolveItem(itemOrKey);

        if (!selection) {
            return false;
        }

        const applied = this.applySelection(selection, {
            announce: 'always',
            visible: true,
        });

        if (applied) {
            this.focusItem(selection);
            scrollIntoView(selection);
        }

        return applied;
    }

    private storedSelection(items = this.items()): HTMLElement | undefined {
        if (!this.selectedItemKey.get()) {
            return;
        }

        return items.find(
            (item) =>
                item.getAttribute(ITEM_KEY_ATTRIBUTE) ===
                this.selectedItemKey.get()
        );
    }

    private focusSelection(
        items = this.items(),
        activeElement = document.activeElement
    ): HTMLElement | undefined {
        const root = this.host?.root;

        if (!root) {
            return;
        }

        const resolvedActiveElement = activeElementWithinRoot(
            root,
            activeElement
        );

        const item = items.find(
            (item) =>
                item === resolvedActiveElement ||
                item.contains(resolvedActiveElement || null)
        );

        if (item) {
            return item;
        }

        const key =
            resolvedActiveElement
                ?.closest(OWNED_SELECTOR)
                ?.getAttribute(OWNER_ATTRIBUTE) || undefined;

        if (key) {
            return items.find(
                (item) => item.getAttribute(ITEM_KEY_ATTRIBUTE) === key
            );
        }

        return undefined;
    }

    private defaultSelection(items = this.items()): HTMLElement | undefined {
        return items.find((item) =>
            item.hasAttribute(DEFAULT_SELECTION_ATTRIBUTE)
        );
    }

    private resolveItem(
        itemOrKey?: HTMLElement | string,
        items = this.items()
    ): HTMLElement | undefined {
        if (itemOrKey instanceof HTMLElement) {
            return items.includes(itemOrKey) ? itemOrKey : undefined;
        }

        if (typeof itemOrKey === 'string') {
            return items.find(
                (item) => item.getAttribute(ITEM_KEY_ATTRIBUTE) === itemOrKey
            );
        }

        return undefined;
    }

    private syncSelectionVisibility() {
        this.host?.root.toggleAttribute(
            SELECTION_VISIBLE_ATTRIBUTE,
            !!this.selectionVisible.get()
        );
    }

    private clearSelectionState(refreshHost = true) {
        const stateChanged =
            this.selectedItemKey.get() !== undefined ||
            !!this.selectionVisible.get();

        if (this.host) {
            clearSelectionMarker(this.host.root);
        }

        this.selectedItemKey.set(undefined);
        this.selectionVisible.set(false);
        this.syncSelectionVisibility();

        clearLiveRegion(this.liveRegion);

        if (refreshHost && stateChanged) {
            this.refreshHost();
        }
    }

    private applySelection(
        selection: HTMLElement,
        {
            visible,
            announce,
            emit = true,
            refreshHost = true,
        }: SelectionMutationOptions = {}
    ): boolean {
        if (!this.host) {
            return false;
        }

        const key = selection.getAttribute(ITEM_KEY_ATTRIBUTE) || undefined;
        const previousVisibility = !!this.selectionVisible.get();
        const selectionChanged = this.selectedItemKey.get() !== key;
        const nextVisibility = visible ?? previousVisibility;
        const visibilityChanged = previousVisibility !== nextVisibility;

        clearSelectionMarker(this.host.root);
        selection.setAttribute(SELECTED_ATTRIBUTE, '');
        this.selectedItemKey.set(key);

        if (visible !== undefined) {
            this.selectionVisible.set(visible);
        }

        this.syncSelectionVisibility();

        if (emit && selectionChanged) {
            this.options.onSelect?.({ item: selection, host: this.host });
        }

        if (
            announce === 'always' ||
            (announce === 'changed' && selectionChanged)
        ) {
            updateLiveRegion(this.liveRegion, this.host.root, selection);
        }

        if (refreshHost && (selectionChanged || visibilityChanged)) {
            this.refreshHost();
        }

        return true;
    }

    private boundaryItem(
        items: HTMLElement[] | undefined,
        direction: 1 | -1
    ): HTMLElement | undefined {
        return items?.[direction > 0 ? 0 : items.length - 1];
    }

    private moveSelection(direction: 1 | -1): boolean {
        const items = this.items();

        if (!items.length) {
            return false;
        }

        const selected =
            this.storedSelection(items) || this.focusSelection(items);

        if (!selected) {
            return this.navigate(this.boundaryItem(items, direction));
        }

        if (!this.selectionVisible.get()) {
            return this.navigate(selected);
        }

        const nextItem = items[items.indexOf(selected) + direction];

        if (nextItem) {
            return this.navigate(nextItem);
        }

        if (!this.host) {
            return false;
        }

        return (
            this.options.onOverflow?.({
                edge: direction > 0 ? 'last' : 'first',
                current: selected,
                host: this.host,
            }) || false
        );
    }

    private onDocumentClick = (e: Event) => {
        const item = targetElement(e.target)?.closest<HTMLElement>(
            ITEM_SELECTOR
        );

        const selection = item ? this.resolveItem(item) : undefined;

        if (selection) {
            // Keep click-derived selection constrained to currently selectable items.
            this.applySelection(selection, { announce: 'changed' });
        }
    };

    private refreshHost() {
        if (!this.host || this.isRefreshingHost) {
            return;
        }

        this.isRefreshingHost = true;

        try {
            this.host.refresh();
        } finally {
            this.isRefreshingHost = false;
        }
    }

    private focusItem(item: HTMLElement) {
        const primary = itemPrimaryTarget(this.host?.root, item);

        if (primary && this.focusWithManagedFallback(primary)) {
            return;
        }

        if (this.focusWithManagedFallback(item)) {
            return;
        }

        this.clearManagedFocusFallback();
    }

    private focusWithManagedFallback(element: HTMLElement): boolean {
        if (this.managedFocusFallbackElement !== element) {
            this.clearManagedFocusFallback();
        }

        element.focus({ preventScroll: true });

        if (document.activeElement === element) {
            return true;
        }

        if (this.managedFocusFallbackElement !== element) {
            if (element.hasAttribute('tabindex')) {
                return false;
            }

            element.setAttribute('tabindex', '-1');
            this.managedFocusFallbackElement = element;
        }

        element.focus({ preventScroll: true });

        return document.activeElement === element;
    }

    private clearManagedFocusFallback() {
        const fallbackElement = this.managedFocusFallbackElement;

        if (!fallbackElement) {
            return;
        }

        if (fallbackElement.getAttribute('tabindex') === '-1') {
            fallbackElement.removeAttribute('tabindex');
        }

        this.managedFocusFallbackElement = undefined;
    }

    private selectionStateKey(): string | undefined {
        if (!this.options.storageKey) {
            return undefined;
        }

        const { pathname, search } = window.location;

        return `${this.options.storageKey}:${pathname}${search}`;
    }

    private selectionVisibilityKey(): string | undefined {
        const prefix = this.selectionStateKey();
        return prefix ? `${prefix}:visible` : undefined;
    }
}

function scrollIntoView(item: HTMLElement) {
    item.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
    });
}

function clearSelectionMarker(root: ParentNode) {
    for (const item of elementsInRoot(root, `[${SELECTED_ATTRIBUTE}]`)) {
        item.removeAttribute(SELECTED_ATTRIBUTE);
    }
}

type SessionStateValue<T> = {
    get(): T | undefined;
    set(value: T | undefined): void;
    rehydrate(): T | undefined;
    reset(value?: T | undefined): void;
};

function createSessionStateValue<T>(
    key: () => string | undefined,
    parse: (value: string) => T | undefined,
    serialize: (value: T) => string,
    initialValue?: T | undefined
): SessionStateValue<T> {
    let currentValue = initialValue;

    return {
        get() {
            return currentValue;
        },
        set(value) {
            currentValue = value;

            const storageKey = key();

            if (!storageKey) {
                return;
            }

            if (value === undefined) {
                sessionStorage.removeItem(storageKey);
                return;
            }

            sessionStorage.setItem(storageKey, serialize(value));
        },
        rehydrate() {
            const storageKey = key();

            if (!storageKey) {
                return currentValue;
            }

            const value = sessionStorage.getItem(storageKey);

            currentValue = value === null ? initialValue : parse(value);
            return currentValue;
        },
        reset(value = initialValue) {
            currentValue = value;
        },
    };
}

function createLiveRegion(): HTMLElement {
    const liveRegion = document.createElement('div');

    Object.assign(liveRegion.style, {
        border: '0',
        clip: 'rect(0 0 0 0)',
        clipPath: 'inset(50%)',
        height: '1px',
        margin: '-1px',
        overflow: 'hidden',
        padding: '0',
        position: 'absolute',
        whiteSpace: 'nowrap',
        width: '1px',
    });

    liveRegion.setAttribute(LIVE_REGION_ATTRIBUTE, '');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');

    document.body.append(liveRegion);

    return liveRegion;
}

function updateLiveRegion(
    liveRegion: HTMLElement | undefined,
    root: ParentNode,
    item: HTMLElement
) {
    if (!liveRegion) {
        return;
    }

    const primary = itemPrimaryTarget(root, item);
    liveRegion.textContent =
        announcementText(primary) || announcementText(item);
}

function clearLiveRegion(liveRegion: HTMLElement | undefined) {
    if (liveRegion) {
        liveRegion.textContent = '';
    }
}

function announcementText(element: HTMLElement | undefined): string {
    return (element?.getAttribute('aria-label') || element?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function itemPrimaryTarget(
    root: ParentNode | null | undefined,
    item: HTMLElement
): HTMLElement | undefined {
    if (!root) {
        return;
    }

    const selector = `[${PRIMARY_SELECTION_ATTRIBUTE}]`;

    return [
        ...elementsInRoot(item, selector),
        ...externalControls(
            root,
            item.getAttribute(ITEM_KEY_ATTRIBUTE) || undefined
        ).flatMap((control) => elementsInRoot(control, selector)),
    ][0];
}

function externalControls(
    root: ParentNode,
    key: string | undefined
): HTMLElement[] {
    if (!key) {
        return [];
    }

    return [
        ...root.querySelectorAll<HTMLElement>(
            `[${OWNER_ATTRIBUTE}="${CSS.escape(key)}"]`
        ),
    ];
}
