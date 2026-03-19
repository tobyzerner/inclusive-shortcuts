import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSelectionPlugin, createShortcuts } from '../src/index';
import { nextTick, pressKey } from './helpers';

afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.restoreAllMocks();
});

function selectionKey(selection: {
    selected(): HTMLElement | undefined;
}): string | undefined {
    return (
        selection.selected()?.getAttribute('data-shortcut-selection-key') ||
        undefined
    );
}

function createSelectionRuntime({
    html,
    storageKey,
    shortcuts = [],
}: {
    html: string;
    storageKey?: string;
    shortcuts?: Parameters<typeof createShortcuts>[0]['shortcuts'];
}) {
    document.body.innerHTML = html;

    const root = document.getElementById('app')!;
    const selection = createSelectionPlugin(
        storageKey ? { storageKey } : undefined
    );
    const runtime = createShortcuts({
        root,
        shortcuts,
        plugins: [selection],
    });

    return { root, selection, runtime };
}

describe('Selection Plugin', () => {
    it('is inert while disconnected', () => {
        document.body.innerHTML = `
            <div id="app">
                <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                    <button type="button">Item one</button>
                </article>
                <article data-shortcut-selection-key="two">
                    <button type="button">Item two</button>
                </article>
            </div>
        `;

        const root = document.getElementById('app')!;
        const items = root.querySelectorAll<HTMLElement>(
            '[data-shortcut-selection-key]'
        );
        const selection = createSelectionPlugin();
        const runtime = createShortcuts({
            root,
            shortcuts: [],
            plugins: [selection],
        });

        expect(selection.items()).toEqual([]);
        expect(selection.selected()).toBeUndefined();
        expect(selection.show()).toBe(false);
        expect(selection.reset()).toBe(false);
        expect(selection.next()).toBe(false);
        expect(selection.previous()).toBe(false);
        expect(selection.first()).toBe(false);
        expect(selection.last()).toBe(false);
        expect(selection.select(items[1])).toBe(false);
        expect(selection.navigate(items[0])).toBe(false);

        runtime.connect();
        runtime.disconnect();

        expect(selection.items()).toEqual([]);
        expect(selection.selected()).toBeUndefined();
        expect(root.querySelector('[data-shortcut-selected]')).toBeNull();
    });

    it('tracks selection in memory by default and persists it when storage is enabled', () => {
        const html = `
            <div id="app">
                <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                    <button type="button">Item one</button>
                </article>
                <article data-shortcut-selection-key="two">
                    <button type="button">Item two</button>
                </article>
            </div>
        `;

        const memory = createSelectionRuntime({ html });
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
        const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

        memory.runtime.connect();
        memory.selection.next();
        memory.selection.reset();

        expect(getItemSpy).not.toHaveBeenCalled();
        expect(setItemSpy).not.toHaveBeenCalled();
        expect(removeItemSpy).not.toHaveBeenCalled();

        memory.runtime.disconnect();

        const persisted = createSelectionRuntime({
            html,
            storageKey: 'selection',
        });
        const key = `selection:${window.location.pathname}${window.location.search}`;

        persisted.runtime.connect();
        persisted.selection.next();
        persisted.selection.next();

        expect(sessionStorage.getItem(key)).toBe('two');
        expect(sessionStorage.getItem(`${key}:visible`)).toBe('1');

        persisted.runtime.disconnect();
    });

    it('restores runtime-only state on refresh and persisted state on reconnect', async () => {
        const html = `
            <div id="app">
                <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                    <button type="button" data-shortcut-selection-primary>Item one</button>
                </article>
                <article data-shortcut-selection-key="two">
                    <button type="button" data-shortcut-selection-primary>Item two</button>
                </article>
            </div>
        `;

        const memory = createSelectionRuntime({ html });
        memory.runtime.connect();
        memory.selection.next();
        memory.selection.next();

        memory.runtime.refresh();
        await nextTick();

        expect(selectionKey(memory.selection)).toBe('two');
        expect(memory.root.getAttribute('data-shortcut-selection-visible')).toBe(
            ''
        );

        memory.runtime.disconnect();

        const persisted = createSelectionRuntime({
            html,
            storageKey: 'selection',
        });

        persisted.runtime.connect();
        persisted.selection.next();
        persisted.selection.next();
        persisted.runtime.disconnect();

        const reconnected = createSelectionRuntime({
            html,
            storageKey: 'selection',
        });

        reconnected.runtime.connect();

        expect(selectionKey(reconnected.selection)).toBe('two');
        expect(
            reconnected.root.getAttribute('data-shortcut-selection-visible')
        ).toBe('');

        reconnected.runtime.disconnect();
    });

    it('preserves a focus-derived selection on refresh', async () => {
        const { root, selection, runtime } = createSelectionRuntime({
            html: `
                <div id="app">
                    <article data-shortcut-selection-key="one">
                        <button type="button" data-shortcut-selection-primary>Item one</button>
                    </article>
                    <article data-shortcut-selection-key="two">
                        <button type="button" data-shortcut-selection-primary>Item two</button>
                    </article>
                </div>
            `,
        });

        const secondPrimary = root.querySelectorAll<HTMLButtonElement>(
            '[data-shortcut-selection-primary]'
        )[1];

        runtime.connect();
        secondPrimary.focus();

        expect(selectionKey(selection)).toBe('two');

        runtime.refresh();
        await nextTick();

        expect(selectionKey(selection)).toBe('two');

        runtime.disconnect();
    });

    it('only calls onSelect when the selected item changes', async () => {
        document.body.innerHTML = `
            <div id="app">
                <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                    <button type="button">Item one</button>
                </article>
                <article data-shortcut-selection-key="two">
                    <button type="button">Item two</button>
                </article>
            </div>
        `;

        const root = document.getElementById('app')!;
        const items = root.querySelectorAll<HTMLElement>(
            '[data-shortcut-selection-key]'
        );
        const onSelect = vi.fn();
        const selection = createSelectionPlugin({ onSelect });
        const runtime = createShortcuts({
            root,
            shortcuts: [],
            plugins: [selection],
        });

        runtime.connect();

        expect(onSelect).not.toHaveBeenCalled();

        runtime.refresh();
        await nextTick();

        expect(onSelect).not.toHaveBeenCalled();
        expect(selection.show()).toBe(true);
        expect(onSelect).not.toHaveBeenCalled();
        expect(selection.select('one')).toBe(true);
        expect(onSelect).not.toHaveBeenCalled();

        expect(selection.select('two')).toBe(true);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0]?.[0]?.item).toBe(items[1]);

        expect(selection.navigate('two')).toBe(true);
        expect(onSelect).toHaveBeenCalledTimes(1);

        (items[0].querySelector('button') as HTMLButtonElement).click();
        await nextTick();

        expect(onSelect).toHaveBeenCalledTimes(2);
        expect(onSelect.mock.calls[1]?.[0]?.item).toBe(items[0]);

        expect(selection.select('two')).toBe(true);
        expect(onSelect).toHaveBeenCalledTimes(3);
        expect(onSelect.mock.calls[2]?.[0]?.item).toBe(items[1]);

        expect(selection.reset()).toBe(true);
        expect(onSelect).toHaveBeenCalledTimes(4);
        expect(onSelect.mock.calls[3]?.[0]?.item).toBe(items[0]);

        runtime.disconnect();
    });

    it('does not call onSelect when reset clears selection without a default item', () => {
        document.body.innerHTML = `
            <div id="app">
                <article data-shortcut-selection-key="one">
                    <button type="button">Item one</button>
                </article>
                <article data-shortcut-selection-key="two">
                    <button type="button">Item two</button>
                </article>
            </div>
        `;

        const root = document.getElementById('app')!;
        const onSelect = vi.fn();
        const selection = createSelectionPlugin({ onSelect });
        const runtime = createShortcuts({
            root,
            shortcuts: [],
            plugins: [selection],
        });

        runtime.connect();
        expect(selection.select('two')).toBe(true);
        expect(onSelect).toHaveBeenCalledTimes(1);

        onSelect.mockClear();

        expect(selection.reset()).toBe(true);
        expect(onSelect).not.toHaveBeenCalled();

        runtime.disconnect();
    });

    it('selects items by key or element and rejects invalid targets', () => {
        document.body.innerHTML = `
            <button type="button" id="outside">Outside</button>
            <div id="app">
                <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                    <button type="button">Item one</button>
                </article>
                <article data-shortcut-selection-key="two">
                    <button type="button">Item two</button>
                </article>
            </div>
        `;

        const root = document.getElementById('app')!;
        const items = root.querySelectorAll<HTMLElement>(
            '[data-shortcut-selection-key]'
        );
        const outside = document.getElementById('outside') as HTMLButtonElement;
        const selection = createSelectionPlugin();
        const runtime = createShortcuts({
            root,
            shortcuts: [],
            plugins: [selection],
        });

        runtime.connect();

        expect(selection.select('two')).toBe(true);
        expect(selectionKey(selection)).toBe('two');
        expect(selection.navigate(items[0])).toBe(true);
        expect(selectionKey(selection)).toBe('one');
        expect(selection.select('missing')).toBe(false);
        expect(selection.navigate(outside)).toBe(false);
        expect(selectionKey(selection)).toBe('one');

        runtime.disconnect();
    });

    it('can reveal the focus-derived selection', () => {
        const { root, selection, runtime } = createSelectionRuntime({
            html: `
                <div id="app">
                    <article data-shortcut-selection-key="one">
                        <button type="button" data-shortcut-selection-primary>Item one</button>
                    </article>
                    <article data-shortcut-selection-key="two">
                        <button type="button" data-shortcut-selection-primary>Item two</button>
                    </article>
                </div>
            `,
        });
        const items = root.querySelectorAll<HTMLElement>(
            '[data-shortcut-selection-key]'
        );

        runtime.connect();
        items[1].querySelector<HTMLElement>('button')!.focus();

        expect(selection.show()).toBe(true);
        expect(selectionKey(selection)).toBe('two');
        expect(root.hasAttribute('data-shortcut-selection-visible')).toBe(true);
        expect(items[1].hasAttribute('data-shortcut-selected')).toBe(true);

        runtime.disconnect();
    });

    it('resets selection back to the hidden default item', () => {
        const { root, selection, runtime } = createSelectionRuntime({
            html: `
                <div id="app">
                    <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                        <button type="button" data-shortcut-selection-primary>Item one</button>
                    </article>
                    <article data-shortcut-selection-key="two">
                        <button type="button" data-shortcut-selection-primary>Item two</button>
                    </article>
                </div>
            `,
        });

        runtime.connect();

        expect(selection.select('two')).toBe(true);
        expect(selection.show()).toBe(true);
        expect(selection.reset()).toBe(true);
        expect(selectionKey(selection)).toBe('one');
        expect(root.hasAttribute('data-shortcut-selection-visible')).toBe(
            false
        );
        expect(selection.reset()).toBe(false);

        runtime.disconnect();
    });

    it('clears selection on reset when no default item exists', () => {
        const { root, selection, runtime } = createSelectionRuntime({
            html: `
                <div id="app">
                    <article data-shortcut-selection-key="one">
                        <button type="button">Item one</button>
                    </article>
                    <article data-shortcut-selection-key="two">
                        <button type="button">Item two</button>
                    </article>
                </div>
            `,
        });

        runtime.connect();

        expect(selection.select('two')).toBe(true);
        expect(selection.reset()).toBe(true);
        expect(selection.selected()).toBeUndefined();
        expect(root.hasAttribute('data-shortcut-selection-visible')).toBe(
            false
        );
        expect(root.querySelector('[data-shortcut-selected]')).toBeNull();

        runtime.disconnect();
    });

    it('uses the current selection for selection-scoped shortcuts and gives active scopes priority', async () => {
        const { root, runtime } = createSelectionRuntime({
            html: `
                <div id="app">
                    <form data-shortcut-scope="form">
                        <button type="button" id="inside-form">Inside form</button>
                        <button type="button" data-shortcut-trigger="form.submit">Submit form</button>
                    </form>
                    <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                        <button type="button" data-shortcut-trigger="selection.edit">Edit one</button>
                    </article>
                </div>
            `,
            shortcuts: [
                { id: 'form.submit', keys: ['x'], scopes: ['form'] },
                { id: 'selection.edit', keys: ['x'], scopes: ['selection'] },
            ],
        });

        const insideForm = document.getElementById(
            'inside-form'
        ) as HTMLButtonElement;
        const formButton = root.querySelector<HTMLElement>(
            '[data-shortcut-trigger="form.submit"]'
        )!;
        const selectionButton = root.querySelector<HTMLElement>(
            '[data-shortcut-trigger="selection.edit"]'
        )!;
        const formSpy = vi.fn();
        const selectionSpy = vi.fn();

        formButton.addEventListener('click', formSpy);
        selectionButton.addEventListener('click', selectionSpy);

        runtime.connect();

        document.body.tabIndex = -1;
        document.body.focus();
        pressKey(document.body, 'x');
        await nextTick();

        insideForm.focus();
        pressKey(insideForm, 'x');
        await nextTick();

        expect(selectionSpy).toHaveBeenCalledTimes(1);
        expect(formSpy).toHaveBeenCalledTimes(1);

        runtime.disconnect();
    });

    it('reveals the current item before moving and scrolls navigated items into view', async () => {
        const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
        const { root, selection, runtime } = createSelectionRuntime({
            html: `
                <div id="app">
                    <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                        <button type="button" data-shortcut-selection-primary>Edit one</button>
                    </article>
                    <article data-shortcut-selection-key="two">
                        <button type="button" data-shortcut-selection-primary>Edit two</button>
                    </article>
                </div>
            `,
            shortcuts: [
                {
                    id: 'selection.next',
                    keys: ['j'],
                    handle: () => selection.next(),
                },
            ],
        });

        runtime.connect();
        document.body.tabIndex = -1;
        document.body.focus();

        pressKey(document.body, 'j');
        await nextTick();

        expect(selectionKey(selection)).toBe('one');
        expect(root.getAttribute('data-shortcut-selection-visible')).toBe('');

        pressKey(document.body, 'j');
        await nextTick();

        expect(selectionKey(selection)).toBe('two');
        expect(document.activeElement).toBe(
            root.querySelectorAll<HTMLButtonElement>(
                '[data-shortcut-selection-primary]'
            )[1]
        );
        expect(scrollSpy).toHaveBeenCalledTimes(2);

        runtime.disconnect();
    });

    it('uses non-animated scrolling when reduced motion is preferred', async () => {
        vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() {
                return false;
            },
        }));

        const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
        const { selection, runtime } = createSelectionRuntime({
            html: `
                <div id="app">
                    <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                        <button type="button" data-shortcut-selection-primary>Item one</button>
                    </article>
                    <article data-shortcut-selection-key="two">
                        <button type="button" data-shortcut-selection-primary>Item two</button>
                    </article>
                </div>
            `,
            shortcuts: [
                {
                    id: 'selection.next',
                    keys: ['j'],
                    handle: () => selection.next(),
                },
            ],
        });

        runtime.connect();
        document.body.tabIndex = -1;
        document.body.focus();

        pressKey(document.body, 'j');
        await nextTick();

        expect(scrollSpy).toHaveBeenNthCalledWith(1, {
            block: 'nearest',
            inline: 'nearest',
            behavior: 'auto',
        });

        runtime.disconnect();
    });

    it('focuses the primary target when available and falls back to the item with temporary tabindex management', () => {
        const primaryCase = createSelectionRuntime({
            html: `
                <div id="app">
                    <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                        <div id="first-primary" data-shortcut-selection-primary>Item one</div>
                    </article>
                    <article data-shortcut-selection-key="two">
                        <div id="second-primary" data-shortcut-selection-primary>Item two</div>
                    </article>
                </div>
            `,
        });

        primaryCase.runtime.connect();
        primaryCase.selection.first();

        const firstPrimary = document.getElementById('first-primary')!;
        expect(document.activeElement).toBe(firstPrimary);
        expect(firstPrimary.getAttribute('tabindex')).toBe('-1');

        primaryCase.runtime.disconnect();

        const itemCase = createSelectionRuntime({
            html: `
                <div id="app">
                    <article id="item" data-shortcut-selection-key="one" data-shortcut-selection-default tabindex="-1">
                        <div>Item one</div>
                    </article>
                </div>
            `,
        });

        const item = document.getElementById('item') as HTMLElement;
        itemCase.runtime.connect();
        itemCase.selection.first();

        expect(document.activeElement).toBe(item);
        expect(item.getAttribute('tabindex')).toBe('-1');

        itemCase.runtime.disconnect();
        expect(item.getAttribute('tabindex')).toBe('-1');
    });

    it('supports owned controls for selection-scoped shortcuts and active shortcut contexts', async () => {
        document.body.innerHTML = `
            <div id="app">
                <article data-shortcut-selection-key='item"]two'>
                    <button id="item-action" type="button" data-shortcut-trigger='other selection."]edit'>
                        Edit in item
                    </button>
                </article>

                <div data-shortcut-context>
                    <button
                        id="owned-action"
                        type="button"
                        data-shortcut-trigger='other selection."]edit'
                        data-shortcut-selection-owner='item"]two'
                    >
                        Edit in context
                    </button>
                </div>
            </div>
        `;

        const root = document.getElementById('app')!;
        const selection = createSelectionPlugin();
        const ownedAction = document.getElementById(
            'owned-action'
        ) as HTMLButtonElement;
        const itemAction = document.getElementById(
            'item-action'
        ) as HTMLButtonElement;
        const handleSpy = vi.fn();

        const runtime = createShortcuts({
            root,
            shortcuts: [
                {
                    id: 'selection."]edit',
                    keys: ['e'],
                    scopes: ['selection'],
                    handle: ({ target }) => {
                        handleSpy(target);
                        return true;
                    },
                },
            ],
            plugins: [selection],
        });

        runtime.connect();
        selection.select(
            root.querySelector<HTMLElement>(
                `[data-shortcut-selection-key='item"]two']`
            ) || undefined
        );
        ownedAction.focus();

        pressKey(ownedAction, 'e');
        await nextTick();

        expect(handleSpy).toHaveBeenCalledWith(ownedAction);
        expect(handleSpy).not.toHaveBeenCalledWith(itemAction);
        expect(selectionKey(selection)).toBe('item"]two');

        runtime.disconnect();
    });

    it('mounts a live region on the document body and announces the primary target label', () => {
        const { root, selection, runtime } = createSelectionRuntime({
            html: `
                <ul id="app">
                    <li data-shortcut-selection-key="one" data-shortcut-selection-default>
                        Noisy item text
                        <button
                            type="button"
                            data-shortcut-selection-primary
                            aria-label="Open first item"
                        >
                            Open
                        </button>
                    </li>
                </ul>
            `,
        });

        runtime.connect();
        selection.first();

        expect(root.querySelector('[data-shortcut-selection-status]')).toBeNull();
        expect(
            document.body.querySelector('[data-shortcut-selection-status]')
        ).not.toBeNull();
        expect(
            document.body.querySelector('[data-shortcut-selection-status]')
                ?.textContent
        ).toBe('Open first item');

        runtime.disconnect();
    });
});
