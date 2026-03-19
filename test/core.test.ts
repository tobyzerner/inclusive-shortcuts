import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShortcuts } from '../src/index';
import { nextTick, pressKey } from './helpers';

afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.restoreAllMocks();
});

function focusBody() {
    document.body.tabIndex = -1;
    document.body.focus();
}

describe('Core', () => {
    it('activates scoped shortcuts when focus is inside the matching scope', async () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="global.open">Open</button>
            <form data-shortcut-scope="form">
                <textarea></textarea>
                <button type="button" data-shortcut-trigger="form.submit">Publish</button>
            </form>
        `;

        const openButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="global.open"]'
        )!;
        const submitButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="form.submit"]'
        )!;
        const textarea =
            document.querySelector<HTMLTextAreaElement>('textarea')!;
        const openSpy = vi.fn();
        const submitSpy = vi.fn();

        openButton.addEventListener('click', openSpy);
        submitButton.addEventListener('click', submitSpy);

        const runtime = createShortcuts({
            shortcuts: [
                { id: 'global.open', keys: ['o'] },
                {
                    id: 'form.submit',
                    keys: ['Control+Enter'],
                    scopes: ['form'],
                },
            ],
        });

        runtime.connect();
        textarea.focus();

        pressKey(textarea, 'Enter', { ctrlKey: true });
        await nextTick();

        expect(submitSpy).toHaveBeenCalledTimes(1);
        expect(openSpy).not.toHaveBeenCalled();

        runtime.disconnect();
    });

    it('supports single-key shortcuts and multi-key sequences', async () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="search.open">Search</button>
            <button type="button" data-shortcut-trigger="navigation.home">Home</button>
        `;

        const searchButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="search.open"]'
        )!;
        const homeButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="navigation.home"]'
        )!;
        const searchSpy = vi.fn();
        const homeSpy = vi.fn();

        searchButton.addEventListener('click', searchSpy);
        homeButton.addEventListener('click', homeSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [
                { id: 'search.open', keys: ['/'] },
                { id: 'navigation.home', keys: ['g h'] },
            ],
        });

        runtime.connect();

        pressKey(document.body, '/');
        pressKey(document.body, 'g');
        pressKey(document.body, 'h');
        await nextTick();

        expect(searchSpy).toHaveBeenCalledTimes(1);
        expect(homeSpy).toHaveBeenCalledTimes(1);

        runtime.disconnect();
    });

    it('prefers shorter bindings over longer bindings with the same prefix', async () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="go">Go</button>
            <button type="button" data-shortcut-trigger="home">Home</button>
        `;

        const goButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="go"]'
        )!;
        const homeButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="home"]'
        )!;
        const goSpy = vi.fn();
        const homeSpy = vi.fn();

        goButton.addEventListener('click', goSpy);
        homeButton.addEventListener('click', homeSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [
                { id: 'go', keys: ['g'] },
                { id: 'home', keys: ['g h'] },
            ],
        });

        runtime.connect();

        pressKey(document.body, 'g');
        pressKey(document.body, 'h');
        await nextTick();

        expect(goSpy).toHaveBeenCalledTimes(1);
        expect(homeSpy).not.toHaveBeenCalled();

        runtime.disconnect();
    });

    it('treats non-matching sequence follow-up keys as fresh input', async () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="composer.open">Compose</button>
        `;

        const composeButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="composer.open"]'
        )!;
        const composeSpy = vi.fn();

        composeButton.addEventListener('click', composeSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [
                { id: 'navigation.home', keys: ['g h'] },
                { id: 'composer.open', keys: ['x'] },
            ],
        });

        runtime.connect();

        pressKey(document.body, 'g');
        pressKey(document.body, 'x');
        await nextTick();

        expect(composeSpy).toHaveBeenCalledTimes(1);

        runtime.disconnect();
    });

    it('warns and ignores later shortcuts with duplicate ids', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="search">Search</button>
            <button type="button" data-shortcut-trigger="composer.open">Compose</button>
        `;

        const searchButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="search"]'
        )!;
        const composeButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="composer.open"]'
        )!;
        const searchSpy = vi.fn();
        const composeSpy = vi.fn();

        searchButton.addEventListener('click', searchSpy);
        composeButton.addEventListener('click', composeSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [
                { id: 'search', keys: ['/'] },
                { id: 'search', keys: ['c'] },
                { id: 'composer.open', keys: ['c'] },
            ],
        });

        runtime.connect();

        pressKey(document.body, '/');
        pressKey(document.body, 'c');
        await nextTick();

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toContain('shortcut id "search"');
        expect(searchSpy).toHaveBeenCalledTimes(1);
        expect(composeSpy).toHaveBeenCalledTimes(1);

        runtime.disconnect();
    });

    it('lets handlers opt out by returning false', async () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="composer.open">Compose</button>
        `;

        const button = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="composer.open"]'
        )!;
        const clickSpy = vi.fn();

        button.addEventListener('click', clickSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [
                {
                    id: 'composer.open',
                    keys: ['c'],
                    handle: () => false,
                },
            ],
        });

        runtime.connect();

        const event = pressKey(document.body, 'c');
        await nextTick();

        expect(clickSpy).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);

        runtime.disconnect();
    });

    it('prevents default and stops later keydown listeners for handled shortcuts', () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="search.open">Search</button>
        `;

        const button = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="search.open"]'
        )!;
        const clickSpy = vi.fn();
        const laterListener = vi.fn();

        button.addEventListener('click', clickSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [{ id: 'search.open', keys: ['/'] }],
        });

        runtime.connect();
        document.addEventListener('keydown', laterListener);

        const event = pressKey(document.body, '/');

        document.removeEventListener('keydown', laterListener);

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
        expect(laterListener).not.toHaveBeenCalled();

        runtime.disconnect();
    });

    it('runs plugin lifecycle hooks around handled shortcuts', async () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="composer.open">Compose</button>
        `;

        const button = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="composer.open"]'
        )!;
        const order: string[] = [];

        button.addEventListener('click', () => order.push('click'));

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [{ id: 'composer.open', keys: ['c'] }],
            plugins: [
                {
                    beforeShortcut: ({ state }) => {
                        order.push(state.activeElement ? 'before' : 'before-miss');
                    },
                    handleShortcut: ({ target }) => {
                        order.push(target === button ? 'handle' : 'handle-miss');
                    },
                    afterShortcut: ({ target }) => {
                        order.push(target === button ? 'after' : 'after-miss');
                    },
                },
            ],
        });

        runtime.connect();

        pressKey(document.body, 'c');
        await nextTick();

        expect(order).toEqual(['before', 'handle', 'click', 'after']);

        runtime.disconnect();
    });

    it('lets beforeShortcut cancel handling before target resolution', async () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="composer.open">Compose</button>
        `;

        const button = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="composer.open"]'
        )!;
        const clickSpy = vi.fn();
        const afterSpy = vi.fn();

        button.addEventListener('click', clickSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [{ id: 'composer.open', keys: ['c'] }],
            plugins: [
                {
                    beforeShortcut: () => false,
                    handleShortcut: () => true,
                    afterShortcut: afterSpy,
                },
            ],
        });

        runtime.connect();

        pressKey(document.body, 'c');
        await nextTick();

        expect(clickSpy).not.toHaveBeenCalled();
        expect(afterSpy).not.toHaveBeenCalled();

        runtime.disconnect();
    });

    it('runs plugin refresh on connect and explicit runtime refresh', () => {
        const refreshSpy = vi.fn();
        const runtime = createShortcuts({
            shortcuts: [],
            plugins: [{ refresh: refreshSpy }],
        });

        runtime.connect();
        runtime.refresh();

        expect(refreshSpy).toHaveBeenCalledTimes(2);

        runtime.disconnect();
    });

    it('runs plugin cleanup functions in reverse connect order', () => {
        const order: string[] = [];
        const runtime = createShortcuts({
            shortcuts: [],
            plugins: [
                {
                    connect: () => {
                        order.push('connect-first');
                        return () => order.push('cleanup-first');
                    },
                },
                {
                    connect: () => {
                        order.push('connect-second');
                        return () => order.push('cleanup-second');
                    },
                },
            ],
        });

        runtime.connect();
        runtime.disconnect();

        expect(order).toEqual([
            'connect-first',
            'connect-second',
            'cleanup-second',
            'cleanup-first',
        ]);
    });

    it('resolves targets from the configured runtime root even when focus is outside it', async () => {
        document.body.innerHTML = `
            <button type="button" id="outside-focus">Outside focus</button>
            <div id="app">
                <button type="button" data-shortcut-trigger="global.open">Inside</button>
            </div>
        `;

        const root = document.getElementById('app')!;
        const outsideFocus = document.getElementById(
            'outside-focus'
        ) as HTMLButtonElement;
        const insideButton = root.querySelector<HTMLElement>(
            '[data-shortcut-trigger="global.open"]'
        )!;
        const clickSpy = vi.fn();

        insideButton.addEventListener('click', clickSpy);

        const runtime = createShortcuts({
            root,
            shortcuts: [{ id: 'global.open', keys: ['o'] }],
        });

        runtime.connect();
        outsideFocus.focus();

        pressKey(outsideFocus, 'o');
        await nextTick();

        expect(clickSpy).toHaveBeenCalledTimes(1);

        runtime.disconnect();
    });

    it('ignores shortcut contexts and scoped roots that are outside the configured runtime root', async () => {
        document.body.innerHTML = `
            <div data-shortcut-context>
                <section data-shortcut-scope="form">
                    <button type="button" id="outside-focus">Outside focus</button>
                    <button type="button" data-shortcut-trigger="form.submit">Outside submit</button>
                    <button type="button" data-shortcut-trigger="global.open">Outside open</button>
                </section>
            </div>
            <div id="app">
                <button type="button" data-shortcut-trigger="form.submit">Inside submit</button>
                <button type="button" data-shortcut-trigger="global.open">Inside open</button>
            </div>
        `;

        const root = document.getElementById('app')!;
        const outsideFocus = document.getElementById(
            'outside-focus'
        ) as HTMLButtonElement;
        const [outsideSubmit, insideSubmit] =
            document.querySelectorAll<HTMLElement>(
                '[data-shortcut-trigger="form.submit"]'
            );
        const [outsideOpen, insideOpen] = document.querySelectorAll<HTMLElement>(
            '[data-shortcut-trigger="global.open"]'
        );
        const outsideSubmitSpy = vi.fn();
        const insideSubmitSpy = vi.fn();
        const outsideOpenSpy = vi.fn();
        const insideOpenSpy = vi.fn();

        outsideSubmit.addEventListener('click', outsideSubmitSpy);
        insideSubmit.addEventListener('click', insideSubmitSpy);
        outsideOpen.addEventListener('click', outsideOpenSpy);
        insideOpen.addEventListener('click', insideOpenSpy);

        const runtime = createShortcuts({
            root,
            shortcuts: [
                { id: 'form.submit', keys: ['x'], scopes: ['form'] },
                { id: 'global.open', keys: ['o'] },
            ],
        });

        runtime.connect();
        outsideFocus.focus();

        const scopedEvent = pressKey(outsideFocus, 'x');
        pressKey(outsideFocus, 'o');
        await nextTick();

        expect(outsideSubmitSpy).not.toHaveBeenCalled();
        expect(insideSubmitSpy).not.toHaveBeenCalled();
        expect(scopedEvent.defaultPrevented).toBe(false);
        expect(outsideOpenSpy).not.toHaveBeenCalled();
        expect(insideOpenSpy).toHaveBeenCalledTimes(1);

        runtime.disconnect();
    });

    it('warns when more than one runtime is connected on the same document', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const first = createShortcuts({ shortcuts: [] });
        const second = createShortcuts({ shortcuts: [] });

        first.connect();
        second.connect();

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toContain(
            'multiple connected runtimes on one document'
        );

        second.disconnect();
        first.disconnect();
    });

    it('throws when root belongs to a different document', () => {
        const iframe = document.createElement('iframe');
        document.body.append(iframe);

        const iframeDocument = iframe.contentDocument!;
        iframeDocument.body.innerHTML = `
            <div id="app">
                <button type="button" data-shortcut-trigger="global.open">Open</button>
            </div>
        `;

        const root = iframeDocument.getElementById('app') as HTMLElement;
        expect(() =>
            createShortcuts({
                root,
                shortcuts: [{ id: 'global.open', keys: ['o'] }],
            })
        ).toThrowError(
            'inclusive-shortcuts: `root` must belong to the current document.'
        );
    });

    it('activates popup triggers with click semantics by default', async () => {
        document.body.innerHTML = `
            <button type="button" data-ui-popup-trigger data-shortcut-trigger="dialog.open">
                Open dialog
            </button>
        `;

        const button = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="dialog.open"]'
        )!;
        const clickSpy = vi.fn();

        button.addEventListener('click', clickSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [{ id: 'dialog.open', keys: ['d'] }],
        });

        runtime.connect();

        pressKey(document.body, 'd');
        await nextTick();

        expect(clickSpy).toHaveBeenCalledTimes(1);

        runtime.disconnect();
    });

    it('focuses non-clickable focusable targets by default', async () => {
        document.body.innerHTML = `
            <div
                id="palette-input"
                tabindex="0"
                data-shortcut-trigger="palette.focus"
            >
                Palette input
            </div>
        `;

        const target = document.getElementById('palette-input') as HTMLElement;

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [{ id: 'palette.focus', keys: ['p'] }],
        });

        runtime.connect();

        pressKey(document.body, 'p');
        await nextTick();

        expect(document.activeElement).toBe(target);

        runtime.disconnect();
    });

    it('does not resolve targets inside inert subtrees, even when marked as shortcut-hidden', async () => {
        document.body.innerHTML = `
            <div inert data-shortcut-hidden>
                <button type="button" data-shortcut-trigger="composer.open">Hidden</button>
            </div>
        `;

        const button = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="composer.open"]'
        )!;
        const clickSpy = vi.fn();

        button.addEventListener('click', clickSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [{ id: 'composer.open', keys: ['c'] }],
        });

        runtime.connect();

        const event = pressKey(document.body, 'c');
        await nextTick();

        expect(clickSpy).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);

        runtime.disconnect();
    });

    it('does not resolve explicitly hidden descendants inside shortcut-hidden subtrees', async () => {
        document.body.innerHTML = `
            <div hidden data-shortcut-hidden>
                <button type="button" hidden data-shortcut-trigger="composer.open">
                    Hidden button
                </button>
                <button type="button" style="display: none" data-shortcut-trigger="composer.open">
                    Display none button
                </button>
                <button type="button" style="visibility: hidden" data-shortcut-trigger="composer.open">
                    Invisible button
                </button>
            </div>
        `;

        const buttons = document.querySelectorAll<HTMLElement>(
            '[data-shortcut-trigger="composer.open"]'
        );
        const spies = [...buttons].map(() => vi.fn());

        buttons.forEach((button, index) => {
            button.addEventListener('click', spies[index]);
        });

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [{ id: 'composer.open', keys: ['c'] }],
        });

        runtime.connect();

        const event = pressKey(document.body, 'c');
        await nextTick();

        spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
        expect(event.defaultPrevented).toBe(false);

        runtime.disconnect();
    });

    it('resolves a hidden target when it is itself marked as shortcut-hidden', async () => {
        document.body.innerHTML = `
            <button
                type="button"
                hidden
                data-shortcut-hidden
                data-shortcut-trigger="composer.open"
            >
                Hidden button
            </button>
        `;

        const button = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="composer.open"]'
        )!;
        const clickSpy = vi.fn();

        button.addEventListener('click', clickSpy);

        focusBody();

        const runtime = createShortcuts({
            shortcuts: [{ id: 'composer.open', keys: ['c'] }],
        });

        runtime.connect();

        const event = pressKey(document.body, 'c');
        await nextTick();

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);

        runtime.disconnect();
    });

    it('ignores Alt+character shortcuts in editable fields but allows non-character Alt shortcuts', async () => {
        document.body.innerHTML = `
            <textarea id="textarea"></textarea>
            <div id="editable" contenteditable="true"></div>
            <button type="button" data-shortcut-trigger="search.open">Search</button>
            <button type="button" data-shortcut-trigger="history.back">Back</button>
        `;

        const textarea = document.getElementById('textarea') as HTMLTextAreaElement;
        const editable = document.getElementById('editable') as HTMLElement;
        const searchButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="search.open"]'
        )!;
        const backButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="history.back"]'
        )!;
        const searchSpy = vi.fn();
        const backSpy = vi.fn();

        searchButton.addEventListener('click', searchSpy);
        backButton.addEventListener('click', backSpy);

        const runtime = createShortcuts({
            shortcuts: [
                { id: 'search.open', keys: ['Alt+s'] },
                { id: 'history.back', keys: ['Alt+ArrowLeft'] },
            ],
        });

        runtime.connect();

        textarea.focus();
        pressKey(textarea, 's', { altKey: true });
        pressKey(textarea, 'ArrowLeft', { altKey: true });

        editable.focus();
        pressKey(editable, 's', { altKey: true });
        pressKey(editable, 'ArrowLeft', { altKey: true });
        await nextTick();

        expect(searchSpy).not.toHaveBeenCalled();
        expect(backSpy).toHaveBeenCalledTimes(2);

        runtime.disconnect();
    });

    it('cleans up document listeners and plugin cleanups if plugin setup throws', () => {
        const cleanupSpy = vi.fn();
        const laterListener = vi.fn();
        const runtime = createShortcuts({
            shortcuts: [{ id: 'search.open', keys: ['/'] }],
            plugins: [
                {
                    connect: () => cleanupSpy,
                },
                {
                    connect: () => {
                        throw new Error('plugin setup failed');
                    },
                },
            ],
        });

        expect(() => runtime.connect()).toThrow('plugin setup failed');
        expect(cleanupSpy).toHaveBeenCalledTimes(1);

        document.addEventListener('keydown', laterListener);
        pressKey(document.body, '/');
        document.removeEventListener('keydown', laterListener);

        expect(laterListener).toHaveBeenCalledTimes(1);
    });
});
