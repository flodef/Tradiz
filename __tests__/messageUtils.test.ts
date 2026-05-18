import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE, postMessageToParent, REFRESH } from '../src/app/utils/message';

// Mock USE_DIGICARTE to be true for all tests
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
