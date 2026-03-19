import { parseKeybinding } from 'tinykeys';
import type { ShortcutPlugin, Shortcuts } from './core';

export function createAriaPlugin(): ShortcutPlugin {
    return new AriaPlugin();
}

export class AriaPlugin implements ShortcutPlugin {
    private host?: Shortcuts;
    private shortcutTargets = new Map<HTMLElement, string>();
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

        syncAriaShortcutTargets(this.host, this.shortcutTargets);
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

        for (const element of this.shortcutTargets.keys()) {
            element.removeAttribute('aria-keyshortcuts');
        }

        this.shortcutTargets = new Map();
        this.host = undefined;
    }
}

function syncAriaShortcutTargets(
    host: Shortcuts,
    shortcutTargets: Map<HTMLElement, string>
) {
    const nextTargets = new Map<HTMLElement, Set<string>>();
    const activeElement = document.activeElement;

    for (const shortcut of host.shortcuts) {
        const target = host.resolveTarget(shortcut, activeElement);
        const ariaKeys = shortcutAriaKeys(shortcut.keys);

        if (!target || !ariaKeys.length) {
            continue;
        }

        nextTargets.set(
            target,
            new Set([
                ...(nextTargets.get(target) || []),
                ...ariaKeys,
            ])
        );
    }

    const nextTargetValues = new Map<HTMLElement, string>();

    for (const [element, keys] of nextTargets) {
        nextTargetValues.set(element, [...keys].join(' '));
    }

    for (const [element, value] of nextTargetValues) {
        if (element.getAttribute('aria-keyshortcuts') !== value) {
            element.setAttribute('aria-keyshortcuts', value);
        }
    }

    for (const [element, value] of shortcutTargets) {
        if (nextTargetValues.get(element) === value) {
            continue;
        }

        element.removeAttribute('aria-keyshortcuts');
    }

    shortcutTargets.clear();
    for (const [element, value] of nextTargetValues) {
        shortcutTargets.set(element, value);
    }
}

function shortcutAriaKeys(bindings: string[]): string[] {
    return bindings.flatMap((binding) => {
        const presses = parseKeybinding(binding);

        if (presses.length !== 1) {
            return [];
        }

        const [mods, key] = presses[0];

        if (key instanceof RegExp) {
            return [];
        }

        const press =
            mods.length === 1 && mods[0] === 'Shift' && key === '?'
                ? key
                : [...mods, key].join('+');

        return [press];
    });
}
