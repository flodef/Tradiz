import { describe, it, expect } from 'vitest';
import { MissingDataError } from '../src/app/utils/processData';

describe('MissingDataError', () => {
    it('should create error with dataName', () => {
        const error = new MissingDataError('Paramètres');
        expect(error.name).toBe('MissingDataError');
        expect(error.message).toBe('Données manquantes: Paramètres');
        expect(error.dataName).toBe('Paramètres');
        expect(error.isAdmin).toBe(false);
    });

    it('should create error without dataName', () => {
        const error = new MissingDataError();
        expect(error.name).toBe('MissingDataError');
        expect(error.message).toBe('Données manquantes');
        expect(error.dataName).toBeUndefined();
        expect(error.isAdmin).toBe(false);
    });

    it('should create error with isAdmin flag set to true', () => {
        const error = new MissingDataError('Paramètres', true);
        expect(error.name).toBe('MissingDataError');
        expect(error.message).toBe('Données manquantes: Paramètres');
        expect(error.dataName).toBe('Paramètres');
        expect(error.isAdmin).toBe(true);
    });

    it('should create error with isAdmin flag set to false', () => {
        const error = new MissingDataError('Paramètres', false);
        expect(error.name).toBe('MissingDataError');
        expect(error.message).toBe('Données manquantes: Paramètres');
        expect(error.dataName).toBe('Paramètres');
        expect(error.isAdmin).toBe(false);
    });

    it('should be instanceof Error', () => {
        const error = new MissingDataError('Test');
        expect(error instanceof Error).toBe(true);
    });

    it('should be instanceof MissingDataError', () => {
        const error = new MissingDataError('Test');
        expect(error instanceof MissingDataError).toBe(true);
    });
});
