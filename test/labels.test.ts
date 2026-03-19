import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createLabelsPlugin,
    createSelectionPlugin,
    createShortcuts,
} from '../src/index';
import { nextFrame, nextTick } from './helpers';

afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.restoreAllMocks();
});

describe('Labels Plugin', () => {
    it('renders inline labels for the resolved target', async () => {
        document.body.innerHTML = `
            <div>
                <button type="button" data-shortcut-trigger="composer.open">
                    Open
                    <kbd id="first-label" data-shortcut-label="composer.open"></kbd>
                </button>
                <button type="button" data-shortcut-trigger="composer.open">
                    Secondary
                    <kbd id="second-label" data-shortcut-label="composer.open"></kbd>
                </button>
            </div>
        `;

        const firstLabel = document.getElementById('first-label') as HTMLElement;
        const secondLabel = document.getElementById(
            'second-label'
        ) as HTMLElement;

        const runtime = createShortcuts({
            shortcuts: [{ id: 'composer.open', keys: ['Control+K'] }],
            plugins: [createLabelsPlugin()],
        });

        runtime.connect();
        await nextFrame();

        expect(firstLabel.textContent).toBe('Ctrl+K');
        expect(secondLabel.textContent).toBe('Ctrl+K');
        expect(firstLabel.hidden).toBe(false);
        expect(secondLabel.hidden).toBe(true);

        runtime.disconnect();
    });

    it('updates rendered labels when focus changes scope', () => {
        document.body.innerHTML = `
            <form data-shortcut-scope="form">
                <input id="field" />
                <button type="button" data-shortcut-trigger="form.submit">
                    Submit
                    <kbd id="label" data-shortcut-label="form.submit"></kbd>
                </button>
            </form>
        `;

        const field = document.getElementById('field') as HTMLInputElement;
        const label = document.getElementById('label') as HTMLElement;
        const requestAnimationFrameSpy = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback: FrameRequestCallback) => {
                callback(0);
                return 1;
            });

        const runtime = createShortcuts({
            shortcuts: [
                {
                    id: 'form.submit',
                    keys: ['Control+Enter'],
                    scopes: ['form'],
                },
            ],
            plugins: [createLabelsPlugin()],
        });

        runtime.connect();
        field.focus();

        expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
        expect(label.textContent).toBe('Ctrl+⏎');
        expect(label.hidden).toBe(false);

        runtime.disconnect();
    });

    it('updates rendered labels when selection changes without a focus change', async () => {
        document.body.innerHTML = `
            <div id="app">
                <article data-shortcut-selection-key="one" data-shortcut-selection-default>
                    <button type="button" data-shortcut-trigger="selection.edit">
                        Edit one
                        <kbd id="first-label" data-shortcut-label="selection.edit"></kbd>
                    </button>
                </article>
                <article data-shortcut-selection-key="two">
                    <button type="button" data-shortcut-trigger="selection.edit">
                        Edit two
                        <kbd id="second-label" data-shortcut-label="selection.edit"></kbd>
                    </button>
                </article>
            </div>
        `;

        const root = document.getElementById('app')!;
        const selection = createSelectionPlugin();
        const firstLabel = document.getElementById('first-label') as HTMLElement;
        const secondLabel = document.getElementById(
            'second-label'
        ) as HTMLElement;
        const runtime = createShortcuts({
            root,
            shortcuts: [
                {
                    id: 'selection.edit',
                    keys: ['e'],
                    scopes: ['selection'],
                },
            ],
            plugins: [selection, createLabelsPlugin()],
        });

        runtime.connect();
        await nextFrame();

        expect(firstLabel.hidden).toBe(false);
        expect(secondLabel.hidden).toBe(true);

        expect(selection.select('two')).toBe(true);
        await nextTick();

        expect(firstLabel.hidden).toBe(true);
        expect(secondLabel.hidden).toBe(false);

        runtime.disconnect();
    });

    it('clears rendered labels and hidden state on disconnect', async () => {
        document.body.innerHTML = `
            <div>
                <button type="button" data-shortcut-trigger="composer.open">
                    Primary
                    <kbd id="first-label" data-shortcut-label="composer.open"></kbd>
                </button>
                <button type="button" data-shortcut-trigger="composer.open">
                    Secondary
                    <kbd id="second-label" data-shortcut-label="composer.open"></kbd>
                </button>
            </div>
        `;

        const firstLabel = document.getElementById('first-label') as HTMLElement;
        const secondLabel = document.getElementById(
            'second-label'
        ) as HTMLElement;

        const runtime = createShortcuts({
            shortcuts: [{ id: 'composer.open', keys: ['Control+K'] }],
            plugins: [createLabelsPlugin()],
        });

        runtime.connect();
        await nextFrame();
        runtime.disconnect();

        expect(firstLabel.textContent).toBe('');
        expect(secondLabel.textContent).toBe('');
        expect(firstLabel.hidden).toBe(false);
        expect(secondLabel.hidden).toBe(false);
    });
});
