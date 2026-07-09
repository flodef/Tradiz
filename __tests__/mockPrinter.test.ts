import { describe, it, expect } from 'vitest';
import { createMockPrinter } from '../src/app/utils/mockPrinter';

describe('createMockPrinter', () => {
    it('should create a mock printer object', async () => {
        const printer = await createMockPrinter();
        expect(printer).toBeDefined();
        expect(typeof printer).toBe('object');
    });

    it('should have execute method', async () => {
        const printer = await createMockPrinter();
        expect(typeof printer.execute).toBe('function');
    });

    it('should execute without errors', async () => {
        const printer = await createMockPrinter();
        await expect(printer.execute()).resolves.not.toThrow();
    });

    it('should have isPrinterConnected method', async () => {
        const printer = await createMockPrinter();
        expect(typeof printer.isPrinterConnected).toBe('function');
    });

    it('should return true for isPrinterConnected', async () => {
        const printer = await createMockPrinter();
        const isConnected = await printer.isPrinterConnected();
        expect(isConnected).toBe(true);
    });
});
