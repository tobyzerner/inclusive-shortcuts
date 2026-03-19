export function pressKey(
    target: EventTarget,
    key: string,
    options: Omit<KeyboardEventInit, 'key'> = {}
) {
    const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
        ...options,
    });

    target.dispatchEvent(event);

    return event;
}

export function nextFrame() {
    return new Promise((resolve) =>
        requestAnimationFrame(() => resolve(undefined))
    );
}

export function nextTick() {
    return Promise.resolve();
}
