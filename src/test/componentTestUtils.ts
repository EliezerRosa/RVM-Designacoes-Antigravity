import { cleanup } from '@testing-library/react';
import { JSDOM } from 'jsdom';

const GLOBAL_KEYS = [
  'window',
  'document',
  'self',
  'navigator',
  'HTMLElement',
  'Node',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'localStorage',
  'sessionStorage',
  'getComputedStyle',
  'File',
  'Blob',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const;

type GlobalKey = (typeof GLOBAL_KEYS)[number];

export function installDom(url = 'http://localhost/') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url });
  const previousDescriptors = new Map<GlobalKey, PropertyDescriptor | undefined>();

  for (const key of GLOBAL_KEYS) {
    previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }

  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    self: { value: dom.window, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true },
    HTMLElement: { value: dom.window.HTMLElement, configurable: true },
    Node: { value: dom.window.Node, configurable: true },
    Event: { value: dom.window.Event, configurable: true },
    CustomEvent: { value: dom.window.CustomEvent, configurable: true },
    MouseEvent: { value: dom.window.MouseEvent, configurable: true },
    localStorage: { value: dom.window.localStorage, configurable: true },
    sessionStorage: { value: dom.window.sessionStorage, configurable: true },
    getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
    File: { value: dom.window.File, configurable: true },
    Blob: { value: dom.window.Blob, configurable: true },
    requestAnimationFrame: { value: (cb: FrameRequestCallback) => setTimeout(cb, 0), configurable: true },
    cancelAnimationFrame: { value: (id: number) => clearTimeout(id), configurable: true },
  });

  if (!globalThis.alert) {
    Object.defineProperty(globalThis, 'alert', {
      value: () => undefined,
      configurable: true,
      writable: true,
    });
  }

  if (!globalThis.confirm) {
    Object.defineProperty(globalThis, 'confirm', {
      value: () => true,
      configurable: true,
      writable: true,
    });
  }

  return {
    dom,
    cleanup: () => {
      cleanup();
      dom.window.close();
      for (const key of GLOBAL_KEYS) {
        const previous = previousDescriptors.get(key);
        if (previous) {
          Object.defineProperty(globalThis, key, previous);
        }
      }
    },
  };
}