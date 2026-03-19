import { parseKeybinding } from 'tinykeys';
import type { ShortcutPlugin, Shortcuts } from './core';
import { elementsInRoot, TRIGGER_SELECTOR } from './dom';

const LABEL_SELECTOR = '[data-shortcut-label]';

export function createLabelsPlugin(): ShortcutPlugin {
    return new LabelsPlugin();
}

export class LabelsPlugin implements ShortcutPlugin {
    private host?: Shortcuts;
    private renderedBindings = new WeakMap<HTMLElement, string | undefined>();
    private refreshFrame?: number;

    connect(host: Shortcuts) {
        this.host = host;

        document.addEventListener('focusin', this.scheduleRefresh, true);

        return () => this.disconnect();
    }

    refresh() {
        if (!this.host) {
            return;
        }

        syncShortcutLabels(this.host, this.renderedBindings);
    }

    private scheduleRefresh = () => {
        if (!this.host || this.refreshFrame !== undefined) {
            return;
        }

        this.refreshFrame = window.requestAnimationFrame(() => {
            this.refreshFrame = undefined;
            this.refresh();
        });
    };

    private disconnect() {
        if (this.refreshFrame !== undefined) {
            window.cancelAnimationFrame(this.refreshFrame);
            this.refreshFrame = undefined;
        }

        document.removeEventListener('focusin', this.scheduleRefresh, true);

        if (this.host) {
            const labels = elementsInRoot(this.host.root, LABEL_SELECTOR);

            for (const label of labels) {
                clearShortcutLabel(label, this.renderedBindings);
                label.hidden = false;
            }
        }

        this.renderedBindings = new WeakMap();
        this.host = undefined;
    }
}

function syncShortcutLabels(
    host: Shortcuts,
    renderedBindings: WeakMap<HTMLElement, string | undefined>
) {
    const shortcutBindings = new Map(
        host.shortcuts.map((shortcut) => [shortcut.id, shortcut.keys[0]])
    );
    const resolvedTargets = new Map<string, HTMLElement>();
    const activeElement = document.activeElement;

    for (const shortcut of host.shortcuts) {
        const target = host.resolveTarget(shortcut, activeElement);

        if (target) {
            resolvedTargets.set(shortcut.id, target);
        }
    }

    for (const label of elementsInRoot(host.root, LABEL_SELECTOR)) {
        syncShortcutLabel(
            label,
            shortcutBindings,
            resolvedTargets,
            renderedBindings
        );
    }
}

function syncShortcutLabel(
    label: HTMLElement,
    shortcutBindings: Map<string, string | undefined>,
    resolvedTargets: Map<string, HTMLElement>,
    renderedBindings: WeakMap<HTMLElement, string | undefined>
) {
    const shortcutId = label.getAttribute('data-shortcut-label');
    const binding = shortcutId ? shortcutBindings.get(shortcutId) : undefined;

    if (!binding) {
        clearShortcutLabel(label, renderedBindings);
    } else if (renderedBindings.get(label) !== binding) {
        renderedBindings.set(label, binding);
        label.replaceChildren(...shortcutLabelNodes(binding));
    }

    const trigger = label.closest<HTMLElement>(TRIGGER_SELECTOR);

    if (!trigger) {
        label.hidden = false;
        return;
    }

    label.hidden = !!shortcutId && resolvedTargets.get(shortcutId) !== trigger;
}

function clearShortcutLabel(
    label: HTMLElement,
    renderedBindings: WeakMap<HTMLElement, string | undefined>
) {
    renderedBindings.delete(label);
    label.replaceChildren();
}

function shortcutLabelNodes(binding: string): Node[] {
    const mac = isMacPlatform();
    const joiner = mac ? '' : '+';
    const presses = shortcutLabelPresses(binding, mac);

    return presses.flatMap((parts, index) => {
        const nodes: Node[] = [];

        for (const [partIndex, part] of parts.entries()) {
            const element = document.createElement('span');
            element.textContent = part;
            nodes.push(element);

            if (joiner && partIndex < parts.length - 1) {
                nodes.push(document.createTextNode(joiner));
            }
        }

        return index === 0 ? nodes : [document.createTextNode(' '), ...nodes];
    });
}

function shortcutLabelPresses(binding: string, mac: boolean): string[][] {
    return parseKeybinding(binding)
        .map(([mods, key]) => {
            if (key instanceof RegExp) {
                return [];
            }

            if (mods.length === 1 && mods[0] === 'Shift' && key === '?') {
                return [formatShortcutPartForPlatform(key, mac)];
            }

            return [...mods, key].map((part) =>
                formatShortcutPartForPlatform(part, mac)
            );
        })
        .filter((parts) => parts.length);
}

function formatShortcutPartForPlatform(part: string, mac: boolean): string {
    if (part === 'Meta') {
        return mac ? '⌘' : 'Meta';
    }

    if (part === 'Control') {
        return 'Ctrl';
    }

    if (part === 'Shift') {
        return mac ? '⇧' : 'Shift';
    }

    if (part === 'Alt') {
        return mac ? '⌥' : 'Alt';
    }

    if (part === 'Enter') {
        return '⏎';
    }

    if (part === 'Escape') {
        return 'Esc';
    }

    if (part.length === 1) {
        return part.toUpperCase();
    }

    return part;
}

function isMacPlatform(): boolean {
    return navigator.userAgent.includes('Macintosh');
}
