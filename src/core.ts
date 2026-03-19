import {
    bindings,
    isModifierOnlyKey,
    matchBindings,
    splitBindingsByPressCount,
    type Binding,
} from './bindings';
import {
    CONTEXT_SELECTOR,
    elementsInRoot,
    isVisibleTarget,
    shortcutTriggerIds,
    activeElementWithinRoot,
    TRIGGER_SELECTOR,
} from './dom';

const KEY_SEQUENCE_TIMEOUT = 1000;

const connectedRuntimes = new Set<ShortcutRuntime>();

export type ShortcutState = {
    root: HTMLElement;
    activeElement?: HTMLElement;
    activeScopes: Map<string, ParentNode[]>;
};

export type ShortcutBeforeContext = {
    shortcut: Shortcut;
    state: ShortcutState;
    host: Shortcuts;
};

export type ShortcutContext = {
    shortcut: Shortcut;
    target?: HTMLElement;
    state: ShortcutState;
    host: Shortcuts;
};

export type ShortcutHandleResult = boolean | void;
export type ShortcutTargetResolverResult = HTMLElement | null | void;
export type ShortcutBeforeResult = false | void;

export type Shortcut = {
    id: string;
    keys: string[];
    scopes?: string[];
    handle?: (context: ShortcutContext) => ShortcutHandleResult;
};

export type ShortcutPluginCleanup = () => void;

export type ShortcutScopeRootsContext = {
    state: ShortcutState;
    host: Shortcuts;
};

export type ShortcutResolveTargetContext = {
    shortcut: Shortcut;
    state: ShortcutState;
    host: Shortcuts;
};

export type ShortcutPlugin = {
    connect?: (host: Shortcuts) => void | ShortcutPluginCleanup;
    refresh?: (host: Shortcuts) => void;
    scopeRoots?: (
        context: ShortcutScopeRootsContext
    ) => Iterable<{ scope: string; roots: ParentNode[] }>;
    resolveTarget?: (
        context: ShortcutResolveTargetContext
    ) => ShortcutTargetResolverResult;
    // Return false to cancel the shortcut before any handler runs.
    beforeShortcut?: (context: ShortcutBeforeContext) => ShortcutBeforeResult;
    // Return true to handle, false to fall through to native behavior, or return nothing to continue.
    handleShortcut?: (context: ShortcutContext) => ShortcutHandleResult;
    // Runs only after the shortcut has been handled.
    afterShortcut?: (context: ShortcutContext) => void;
};

export type ShortcutOptions = {
    shortcuts: Shortcut[];
    root?: HTMLElement;
    plugins?: ShortcutPlugin[];
};

export interface Shortcuts {
    readonly root: HTMLElement;
    readonly shortcuts: Shortcut[];
    resolveTarget(
        shortcut: Shortcut,
        activeElement?: Element | null
    ): HTMLElement | null | undefined;
    connect(): void;
    disconnect(): void;
    refresh(): void;
}

type PendingSequence = {
    bindings: Binding[];
    pressIndex: number;
};

class ShortcutRuntime implements Shortcuts {
    readonly root: HTMLElement;
    readonly shortcuts: Shortcut[];

    private readonly bindings: Binding[];
    private readonly plugins: ShortcutPlugin[];
    private readonly pluginCleanups: ShortcutPluginCleanup[] = [];

    private pendingSequence?: PendingSequence;
    private sequenceTimeout?: number;
    private connected = false;

    constructor({ shortcuts, root = document.body, plugins }: ShortcutOptions) {
        if (root.ownerDocument !== document) {
            throw new Error(
                'inclusive-shortcuts: `root` must belong to the current document.'
            );
        }

        this.root = root;
        this.plugins = plugins ?? [];
        this.shortcuts = uniqueShortcuts(shortcuts);
        this.bindings = bindings(this.shortcuts);
    }

    connect() {
        if (this.connected) {
            return;
        }

        if (connectedRuntimes.size) {
            console.warn(
                'inclusive-shortcuts: multiple connected runtimes on one document ' +
                    'are not a supported composition model. Use one active runtime ' +
                    'per document; `root` only narrows target resolution and plugin state.'
            );
        }

        document.addEventListener('keydown', this.handleKeydown);

        try {
            this.pluginCleanups.length = 0;
            for (const plugin of this.plugins) {
                const cleanup = plugin.connect?.(this);

                if (typeof cleanup === 'function') {
                    this.pluginCleanups.push(cleanup);
                }
            }

            this.refresh();
            connectedRuntimes.add(this);
            this.connected = true;
        } catch (error) {
            this.teardownConnection();
            throw error;
        }
    }

    disconnect() {
        if (!this.connected) {
            return;
        }

        this.teardownConnection();
    }

    refresh() {
        this.clearPendingSequence();
        this.plugins.forEach((plugin) => plugin.refresh?.(this));
    }

    resolveTarget(shortcut: Shortcut, activeElement?: Element | null) {
        return this.resolveTargetFromState(
            shortcut,
            this.shortcutState(activeElement)
        );
    }

    private shortcutState(activeElement = document.activeElement) {
        const resolvedActiveElement = activeElementWithinRoot(
            this.root,
            activeElement
        );

        const state: ShortcutState = {
            root: this.root,
            activeElement: resolvedActiveElement,
            activeScopes: activeScopes(resolvedActiveElement, this.root),
        };

        for (const plugin of this.plugins) {
            const pluginScopes = plugin.scopeRoots?.({ state, host: this });

            for (const { scope, roots } of pluginScopes ?? []) {
                state.activeScopes.set(scope, [
                    ...new Set([
                        ...(state.activeScopes.get(scope) || []),
                        ...roots,
                    ]),
                ]);
            }
        }

        return state;
    }

    private handleKeydown = (e: KeyboardEvent) => {
        const state = this.shortcutState(
            e.target instanceof Element ? e.target : null
        );

        if (this.pendingSequence) {
            if (this.handlePendingSequence(e, state)) {
                return;
            }

            if (isModifierOnlyKey(e)) {
                return;
            }

            this.clearPendingSequence();
        }

        this.handleFreshKeydown(e, state);
    };

    private handlePendingSequence(
        e: KeyboardEvent,
        state: ShortcutState
    ): boolean {
        if (!this.pendingSequence) {
            return false;
        }

        const matchingBindings = matchBindings(
            e,
            this.pendingSequence.bindings,
            this.pendingSequence.pressIndex
        );

        if (!matchingBindings.length) {
            return false;
        }

        const nextPressIndex = this.pendingSequence.pressIndex + 1;
        const { completedBindings, continuedBindings } =
            splitBindingsByPressCount(matchingBindings, nextPressIndex);

        this.updatePendingSequence(continuedBindings, nextPressIndex);

        return (
            (completedBindings.length > 0 &&
                completedBindings.some((binding) =>
                    this.invokeBinding(binding.shortcuts, e, state)
                )) ||
            continuedBindings.length > 0
        );
    }

    private updatePendingSequence(bindings: Binding[], pressIndex: number) {
        if (bindings.length) {
            this.clearPendingSequence();
            this.pendingSequence = { bindings, pressIndex };
            this.sequenceTimeout = window.setTimeout(
                () => this.clearPendingSequence(),
                KEY_SEQUENCE_TIMEOUT
            );
            return;
        }

        this.clearPendingSequence();
    }

    private clearPendingSequence() {
        if (this.sequenceTimeout !== undefined) {
            window.clearTimeout(this.sequenceTimeout);
        }
        this.pendingSequence = undefined;
        this.sequenceTimeout = undefined;
    }

    private teardownConnection() {
        document.removeEventListener('keydown', this.handleKeydown);
        this.clearPendingSequence();

        for (
            let index = this.pluginCleanups.length - 1;
            index >= 0;
            index -= 1
        ) {
            this.pluginCleanups[index]();
        }
        this.pluginCleanups.length = 0;

        connectedRuntimes.delete(this);
        this.connected = false;
    }

    private handleFreshKeydown(e: KeyboardEvent, state: ShortcutState) {
        const matchingBindings = matchBindings(e, this.bindings);
        const { completedBindings, continuedBindings } =
            splitBindingsByPressCount(matchingBindings, 1);
        const handled = completedBindings.some((binding) =>
            this.invokeBinding(binding.shortcuts, e, state)
        );

        if (handled) {
            return;
        }

        this.updatePendingSequence(continuedBindings, 1);
    }

    private invokeBinding(
        shortcuts: Shortcut[],
        e: KeyboardEvent,
        state: ShortcutState
    ): boolean {
        const activeScopeRanks = new Map(
            [...state.activeScopes.keys()].map((scope, index) => [scope, index])
        );

        const orderedShortcuts = shortcuts
            .map((shortcut, index) => ({
                shortcut,
                index,
                rank: shortcutBindingRank(shortcut, activeScopeRanks),
            }))
            .sort(
                (left, right) =>
                    left.rank - right.rank || left.index - right.index
            );

        return orderedShortcuts.some(
            ({ shortcut }) => this.invoke(shortcut, e, state) !== undefined
        );
    }

    private invoke(
        shortcut: Shortcut,
        e: KeyboardEvent,
        state: ShortcutState
    ): boolean | void {
        if (!this.beforeShortcut({ shortcut, state, host: this })) {
            return false;
        }

        const target = this.resolveTargetFromState(shortcut, state);

        if (target === undefined) {
            return;
        }

        const context: ShortcutContext = {
            shortcut,
            target: target || undefined,
            state,
            host: this,
        };

        const result = this.handleShortcut(context);

        if (result !== true) {
            return result;
        }

        cancelKeyboardEvent(e);
        for (const plugin of this.plugins) {
            plugin.afterShortcut?.(context);
        }

        return true;
    }

    private beforeShortcut(context: ShortcutBeforeContext): boolean {
        return this.plugins.every(
            (plugin) => plugin.beforeShortcut?.(context) !== false
        );
    }

    private resolveTargetFromState(shortcut: Shortcut, state: ShortcutState) {
        for (const plugin of this.plugins) {
            const target = plugin.resolveTarget?.({
                shortcut,
                state,
                host: this,
            });

            if (target !== undefined) {
                return target;
            }
        }

        return resolveDefaultTarget(shortcut, state);
    }

    private handleShortcut(context: ShortcutContext): boolean | void {
        if (context.shortcut.handle) {
            const result = context.shortcut.handle(context);

            if (result !== undefined) {
                return result;
            }
        }

        for (const plugin of this.plugins) {
            const result = plugin.handleShortcut?.(context);

            if (result !== undefined) {
                return result;
            }
        }

        if (!context.target) {
            return;
        }

        activateTarget(context.target);

        return true;
    }
}

export function createShortcuts(options: ShortcutOptions): Shortcuts {
    return new ShortcutRuntime(options);
}

function uniqueShortcuts(shortcuts: Shortcut[]): Shortcut[] {
    const uniqueShortcuts: Shortcut[] = [];
    const shortcutIds = new Set<string>();

    for (const shortcut of shortcuts) {
        if (shortcutIds.has(shortcut.id)) {
            console.warn(
                `inclusive-shortcuts: shortcut id "${shortcut.id}" was not registered because duplicate ids are not supported.`
            );
            continue;
        }

        shortcutIds.add(shortcut.id);
        uniqueShortcuts.push(shortcut);
    }

    return uniqueShortcuts;
}

function activeScopes(
    activeElement: HTMLElement | undefined,
    root: HTMLElement
): Map<string, ParentNode[]> {
    const scopes = new Map<string, ParentNode[]>();
    let element: HTMLElement | null = activeElement || null;

    while (element) {
        const scope = element.dataset.shortcutScope;

        if (scope && !scopes.has(scope)) {
            scopes.set(scope, [element]);
        }

        if (element === root) {
            break;
        }

        element = element.parentElement;
    }

    return scopes;
}

function shortcutBindingRank(
    shortcut: Shortcut,
    activeScopeRanks: Map<string, number>
): number {
    const scopes = shortcutScopes(shortcut);
    const activeScopeCount = activeScopeRanks.size;
    let rank = activeScopeCount + 1;

    for (const scope of scopes) {
        if (scope === 'global') {
            rank = Math.min(rank, activeScopeCount);
            continue;
        }

        const index = activeScopeRanks.get(scope);

        if (index !== undefined) {
            rank = Math.min(rank, index);
        }
    }

    return rank;
}

function resolveDefaultTarget(
    shortcut: Pick<Shortcut, 'id' | 'scopes'>,
    state: ShortcutState
): HTMLElement | null | undefined {
    const roots = scopeRoots(shortcut, state);

    if (!roots) {
        return undefined;
    }

    return findShortcutTargetInRoots(roots, shortcut.id) || null;
}

function scopeRoots(
    shortcut: Pick<Shortcut, 'scopes'>,
    state: ShortcutState
): ParentNode[] | undefined {
    const scopes = shortcutScopes(shortcut);
    const includesGlobal = scopes.includes('global');
    const allowedScopes = new Set(scopes.filter((scope) => scope !== 'global'));

    const roots = [...state.activeScopes.entries()].flatMap(([scope, roots]) =>
        allowedScopes.has(scope) ? roots : []
    );

    if (!includesGlobal && !roots.length) {
        return undefined;
    }

    if (includesGlobal) {
        roots.push(state.root);
    }

    return contextRoots(roots, state.activeElement, state.root);
}

function shortcutScopes(shortcut: Pick<Shortcut, 'scopes'>): string[] {
    return shortcut.scopes?.length ? shortcut.scopes : ['global'];
}

function contextRoots(
    roots: ParentNode[],
    target: HTMLElement | undefined,
    boundary: HTMLElement
): ParentNode[] {
    const context = target?.closest<HTMLElement>(CONTEXT_SELECTOR) || undefined;
    const uniqueRoots = [...new Set(roots)];

    if (!context) {
        return uniqueRoots;
    }

    const contextInsideBoundary = boundary.contains(context);
    const prefersContext =
        contextInsideBoundary &&
        uniqueRoots.some(
            (root) =>
                root instanceof Node &&
                (root.contains(context) || context.contains(root))
        );

    return prefersContext && !uniqueRoots.includes(context)
        ? [context, ...uniqueRoots]
        : uniqueRoots;
}

function findShortcutTargetInRoots(
    roots: ParentNode[],
    id: string
): HTMLElement | undefined {
    const candidates = roots.flatMap((root) =>
        elementsInRoot(root, TRIGGER_SELECTOR).filter((element) =>
            shortcutTriggerIds(element).includes(id)
        )
    );

    return [...new Set(candidates)].find((element) => isVisibleTarget(element));
}

function activateTarget(target: HTMLElement) {
    if (isFocusActivationTarget(target)) {
        target.focus({ preventScroll: true });
        return;
    }

    target.click();
}

function isFocusActivationTarget(target: HTMLElement): boolean {
    return (
        target.matches(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
        ) ||
        (target.tabIndex >= 0 && !isClickActivationTarget(target))
    );
}

function isClickActivationTarget(target: HTMLElement): boolean {
    return target.matches(
        'button, summary, a[href], area[href], audio[controls], video[controls], input:not([type="hidden"]), select, textarea, label'
    );
}

function cancelKeyboardEvent(e: KeyboardEvent) {
    e.preventDefault();
    e.stopImmediatePropagation();
}
