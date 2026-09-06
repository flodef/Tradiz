import { PARAMETER_KEY_LIST, PARAMETER_KEYS } from '@/app/constants/parameterKeys';
import { describe, it, expect } from 'vitest';

describe('PARAMETER_KEYS coverage', () => {
    it('includes phone (regression for silently discarded shop phone)', () => {
        expect(PARAMETER_KEYS.SHOP_PHONE).toBe('phone');
        expect(PARAMETER_KEY_LIST).toContain('phone');
    });

    it('every key the admin config page sends is in the whitelist', () => {
        const adminKeys = [
            'name',
            'address',
            'zipCode',
            'city',
            'serial',
            'id',
            'email',
            'phone',
            'vatNumber',
            'thanksMessage',
            'mercurial',
            'closingHour',
            'yearStartDate',
            'lastModified',
            'productsSettings',
            'searchSettings',
            'displaySettings',
            'userSwitch',
            'useVirtualKeyboard',
            'fidelityRate',
            'pennylaneToken',
        ];
        for (const key of adminKeys) {
            expect(PARAMETER_KEY_LIST).toContain(key);
        }
    });
});
