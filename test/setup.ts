Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: {
        escape(value: string) {
            return value.replace(/["\\]/g, '\\$&');
        },
    },
});

Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
});

Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (id: number) => window.clearTimeout(id),
});

Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: function () {
        return this.isConnected && !this.hidden ? ([new DOMRect()] as DOMRect[]) : [];
    },
});

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: function () {},
});

Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
            return false;
        },
    }),
});

export {};
