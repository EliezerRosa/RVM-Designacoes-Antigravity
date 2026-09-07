if (typeof globalThis.self === 'undefined') {
    globalThis.self = globalThis;
}
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}
if (!globalThis.window.location) {
    globalThis.window.location = {
        href: 'https://rvm-designacoes-antigravity.vercel.app/',
        origin: 'https://rvm-designacoes-antigravity.vercel.app',
        pathname: '/',
        search: '',
        hash: '',
    };
}
if (typeof globalThis.location === 'undefined') {
    globalThis.location = globalThis.window.location;
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: (tag) => ({
            getContext: () => ({}),
            style: {},
            setAttribute: () => {},
            appendChild: () => {},
            removeChild: () => {},
        }),
        body: {
            appendChild: () => {},
            removeChild: () => {},
        },
        head: {
            appendChild: () => {},
            removeChild: () => {},
        },
    };
}
if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        multiply() { return this; }
        translate() { return this; }
        scale() { return this; }
        inverse() { return this; }
        transformPoint(p) { return p; }
    };
}
if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {};
}
if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {};
}
