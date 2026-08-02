import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, CUSTOMER_DISPLAY, postCustomerDisplay, postMessageToParent, REFRESH } from '../src/app/utils/message';

// Mock USE_DIGICARTE to be true so the DigiCarte-gated messages are exercised
vi.mock('../src/app/utils/constants', () => ({
    USE_DIGICARTE: true,
}));

describe('postMessageToParent', () => {
    const originalWindow = global.window;

    beforeEach(() => {
        // Reset to default window mock
        global.window = {
            parent: null,
        } as any;
    });

    afterEach(() => {
        global.window = originalWindow;
    });

    it('does nothing when window.parent is the same as window (no iframe)', () => {
        const mockWindow = { postMessage: vi.fn() };
        global.window = { parent: mockWindow } as any;
        global.window.parent = global.window;

        postMessageToParent('test');
        expect(mockWindow.postMessage).not.toHaveBeenCalled();
    });

    it('posts message to parent when in iframe and USE_DIGICARTE is true', () => {
        const mockPostMessage = vi.fn();
        const parentWindow = { postMessage: mockPostMessage };
        global.window = { parent: parentWindow } as any;

        postMessageToParent('test_type');
        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'test_type' }, '*');
    });

    it('posts CLOSE message', () => {
        const mockPostMessage = vi.fn();
        const parentWindow = { postMessage: mockPostMessage };
        global.window = { parent: parentWindow } as any;

        postMessageToParent(CLOSE);
        expect(mockPostMessage).toHaveBeenCalledWith({ type: CLOSE }, '*');
    });

    it('posts REFRESH message', () => {
        const mockPostMessage = vi.fn();
        const parentWindow = { postMessage: mockPostMessage };
        global.window = { parent: parentWindow } as any;

        postMessageToParent(REFRESH);
        expect(mockPostMessage).toHaveBeenCalledWith({ type: REFRESH }, '*');
    });

    it('uses wildcard origin for cross-origin communication', () => {
        const mockPostMessage = vi.fn();
        const parentWindow = { postMessage: mockPostMessage };
        global.window = { parent: parentWindow } as any;

        postMessageToParent('test');
        expect(mockPostMessage).toHaveBeenCalledWith(expect.any(Object), '*');
    });
});

describe('postCustomerDisplay', () => {
    const originalWindow = global.window;

    afterEach(() => {
        global.window = originalWindow;
    });

    it('posts the payload under the CUSTOMER_DISPLAY type', () => {
        const mockPostMessage = vi.fn();
        global.window = { parent: { postMessage: mockPostMessage } } as any;

        const payload = { line1: 'a', line2: 'b' };
        postCustomerDisplay(payload);

        expect(mockPostMessage).toHaveBeenCalledWith({ type: CUSTOMER_DISPLAY, payload }, '*');
    });

    it('stays silent when there is no host frame to receive it', () => {
        const mockPostMessage = vi.fn();
        global.window = { parent: { postMessage: mockPostMessage } } as any;
        global.window.parent = global.window;

        expect(() => postCustomerDisplay({ line1: '', line2: '' })).not.toThrow();
        expect(mockPostMessage).not.toHaveBeenCalled();
    });
});
