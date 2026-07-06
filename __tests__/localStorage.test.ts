import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../src/app/utils/localStorage';

describe('useLocalStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('should return default value for non-existent key', () => {
        const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
        expect(result.current[0]).toBe('default');
    });

    it('should return stored value from localStorage', () => {
        localStorage.setItem('test-key', JSON.stringify('stored-value'));
        const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
        expect(result.current[0]).toBe('stored-value');
    });

    it('should update localStorage when value changes', () => {
        const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
        act(() => {
            result.current[1]('new-value');
        });
        expect(localStorage.getItem('test-key')).toBe(JSON.stringify('new-value'));
    });

    it('should handle empty string values', () => {
        const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
        act(() => {
            result.current[1]('');
        });
        expect(result.current[0]).toBe('');
        expect(localStorage.getItem('test-key')).toBe(JSON.stringify(''));
    });

    it('should handle numeric values', () => {
        const { result } = renderHook(() => useLocalStorage('test-key', 0));
        act(() => {
            result.current[1](123);
        });
        expect(result.current[0]).toBe(123);
        expect(localStorage.getItem('test-key')).toBe(JSON.stringify(123));
    });

    it('should handle object values', () => {
        const { result } = renderHook(() => useLocalStorage('test-key', {}));
        const obj = { key: 'value', num: 42 };
        act(() => {
            result.current[1](obj);
        });
        expect(result.current[0]).toEqual(obj);
        expect(localStorage.getItem('test-key')).toBe(JSON.stringify(obj));
    });

    it('should handle array values', () => {
        const { result } = renderHook(() => useLocalStorage<(string | number)[]>('test-key', []));
        const arr = [1, 2, 3, 'test'];
        act(() => {
            result.current[1](arr);
        });
        expect(result.current[0]).toEqual(arr);
        expect(localStorage.getItem('test-key')).toBe(JSON.stringify(arr));
    });

    it('should remove item from localStorage when value is undefined', () => {
        const { result } = renderHook(() => useLocalStorage<string | undefined>('test-key', 'default'));
        act(() => {
            result.current[1]('value');
        });
        act(() => {
            result.current[1](undefined);
        });
        expect(localStorage.getItem('test-key')).toBeNull();
    });

    it('should use different storage for different keys', () => {
        const { result: result1 } = renderHook(() => useLocalStorage('key1', 'default1'));
        const { result: result2 } = renderHook(() => useLocalStorage('key2', 'default2'));

        act(() => {
            result1.current[1]('value1');
            result2.current[1]('value2');
        });

        expect(result1.current[0]).toBe('value1');
        expect(result2.current[0]).toBe('value2');
        expect(localStorage.getItem('key1')).toBe(JSON.stringify('value1'));
        expect(localStorage.getItem('key2')).toBe(JSON.stringify('value2'));
    });

    it('should handle corrupted localStorage data', () => {
        localStorage.setItem('test-key', 'invalid-json');
        const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
        expect(result.current[0]).toBe('default');
    });
});
