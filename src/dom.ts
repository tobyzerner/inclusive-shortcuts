export const TRIGGER_SELECTOR = '[data-shortcut-trigger]';
export const CONTEXT_SELECTOR = '[data-shortcut-context]';

export function activeElementWithinRoot(
    root: HTMLElement,
    activeElement: EventTarget | null | undefined
): HTMLElement | undefined {
    const element = targetElement(activeElement);

    return isWithinRoot(root, element) ? element : undefined;
}

export function targetElement(
    eventTarget: EventTarget | null | undefined
): HTMLElement | undefined {
    return eventTarget instanceof HTMLElement
        ? eventTarget
        : eventTarget instanceof Node
        ? eventTarget.parentElement || undefined
        : undefined;
}

export function isWithinRoot(
    root: HTMLElement,
    node: Node | undefined
): node is HTMLElement {
    return !!node && (root === node || root.contains(node));
}

export function shortcutTriggerIds(element: HTMLElement): string[] {
    return (
        element
            .getAttribute('data-shortcut-trigger')
            ?.split(/\s+/)
            .filter(Boolean) || []
    );
}

export function elementsInRoot(
    root: ParentNode,
    selector: string
): HTMLElement[] {
    return [
        ...(root instanceof HTMLElement && root.matches(selector)
            ? [root]
            : []),
        ...root.querySelectorAll<HTMLElement>(selector),
    ];
}

export function isEditableTarget(target: EventTarget | null): boolean {
    return !!targetElement(target)?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
    );
}

export function isVisibleTarget(element: HTMLElement): boolean {
    if (element.matches(':disabled') || isInertTarget(element)) {
        return false;
    }

    const hiddenShortcutBoundary = element.closest<HTMLElement>(
        '[data-shortcut-hidden]'
    );

    if (hiddenShortcutBoundary === element) {
        return true;
    }

    if (element.hidden) {
        return false;
    }

    const style = window.getComputedStyle(element);

    if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
    }

    if (hiddenShortcutBoundary) {
        return true;
    }

    return element.getClientRects().length > 0;
}

function isInertTarget(element: HTMLElement): boolean {
    return !!element.closest('[inert]');
}
