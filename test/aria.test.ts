import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createAriaPlugin,
    createSelectionPlugin,
    createShortcuts,
} from '../src/index';
import { nextTick } from './helpers';

afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.restoreAllMocks();
});

describe('ARIA Plugin', () => {
    it('syncs aria-keyshortcuts for the resolved target', async () => {
        document.body.innerHTML = `
            <div>
                <button type="button" data-shortcut-trigger="composer.open">
                    Primary
                </button>
                <button type="button" data-shortcut-trigger="composer.open">
                    Secondary
                </button>
            </div>
        `;

        const [firstButton, secondButton] =
            document.querySelectorAll<HTMLElement>(
                '[data-shortcut-trigger="composer.open"]'
            );

        const runtime = createShortcuts({
            shortcuts: [{ id: 'composer.open', keys: ['Control+K'] }],
            plugins: [createAriaPlugin()],
        });

        runtime.connect();

        expect(firstButton.getAttribute('aria-keyshortcuts')).toBe('Control+K');
        expect(secondButton.hasAttribute('aria-keyshortcuts')).toBe(false);

        runtime.disconnect();
    });

    it('updates aria-keyshortcuts when focus changes scope', () => {
        document.body.innerHTML = `
            <div>
                <button type="button" data-shortcut-trigger="global.open">
                    Global
                </button>
                <form data-shortcut-scope="form">
                    <input id="field" />
                    <button type="button" data-shortcut-trigger="form.submit">
                        Submit
                    </button>
                </form>
            </div>
        `;

        const field = document.getElementById('field') as HTMLInputElement;
        const globalButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="global.open"]'
        )!;
        const formButton = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="form.submit"]'
        )!;
        const requestAnimationFrameSpy = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback: FrameRequestCallback) => {
                callback(0);
                return 1;
            });

        const runtime = createShortcuts({
            shortcuts: [
                { id: 'global.open', keys: ['o'] },
                {
                    id: 'form.submit',
                    keys: ['Control+Enter'],
                    scopes: ['form'],
                },
            ],
            plugins: [createAriaPlugin()],
        });

        runtime.connect();
        field.focus();

        expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
        expect(globalButton.getAttribute('aria-keyshortcuts')).toBe('o');
        expect(formButton.getAttribute('aria-keyshortcuts')).toBe(
            'Control+Enter'
        );

        runtime.disconnect();
    });

    it('updates aria-keyshortcuts when selection changes without a focus change', async () => {
        document.body.innerHTML = `
            <div id="app">
                <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                    <button id="first-button" type="button" data-shortcut-trigger="selection.edit">
                        Edit one
                    </button>
                </article>
                <article data-shortcut-selection-key="two">
                    <button id="second-button" type="button" data-shortcut-trigger="selection.edit">
                        Edit two
                    </button>
                </article>
            </div>
        `;

        const root = document.getElementById('app')!;
        const selection = createSelectionPlugin();
        const firstButton = document.getElementById(
            'first-button'
        ) as HTMLButtonElement;
        const secondButton = document.getElementById(
            'second-button'
        ) as HTMLButtonElement;
        const runtime = createShortcuts({
            root,
            shortcuts: [
                {
                    id: 'selection.edit',
                    keys: ['e'],
                    scopes: ['selection'],
                },
            ],
            plugins: [selection, createAriaPlugin()],
        });

        runtime.connect();

        expect(firstButton.getAttribute('aria-keyshortcuts')).toBe('e');
        expect(secondButton.hasAttribute('aria-keyshortcuts')).toBe(false);

        expect(selection.select('two')).toBe(true);
        await nextTick();

        expect(firstButton.hasAttribute('aria-keyshortcuts')).toBe(false);
        expect(secondButton.getAttribute('aria-keyshortcuts')).toBe('e');

        runtime.disconnect();
    });

    it('clears aria metadata on disconnect', () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="composer.open">
                Open
            </button>
        `;

        const button = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="composer.open"]'
        )!;

        const runtime = createShortcuts({
            shortcuts: [{ id: 'composer.open', keys: ['Control+K'] }],
            plugins: [createAriaPlugin()],
        });

        runtime.connect();
        runtime.disconnect();

        expect(button.hasAttribute('aria-keyshortcuts')).toBe(false);
    });

    it('does not write aria-keyshortcuts for sequence-only bindings', () => {
        document.body.innerHTML = `
            <button type="button" data-shortcut-trigger="navigation.home">
                Home
            </button>
        `;

        const button = document.querySelector<HTMLElement>(
            '[data-shortcut-trigger="navigation.home"]'
        )!;

        const runtime = createShortcuts({
            shortcuts: [{ id: 'navigation.home', keys: ['g h'] }],
            plugins: [createAriaPlugin()],
        });

        runtime.connect();

        expect(button.hasAttribute('aria-keyshortcuts')).toBe(false);

        runtime.disconnect();
    });
});
