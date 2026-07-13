import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role, User, Mercurial } from '../src/app/utils/interfaces';
import { resolveUserFromKey, buildParameters } from '../src/app/utils/processData';

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('resolveUserFromKey', () => {
    beforeEach(() => {
        mockFetch.mockClear();
    });

    it('returns null user when no public key provided', async () => {
        const result = await resolveUserFromKey(undefined);
        expect(result.foundUser).toBeUndefined();
        expect(result.user).toBeNull();
    });

    it('returns found user from API', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ user: { name: 'toto', role: Role.admin, key: '1234' } }),
        });
        const result = await resolveUserFromKey('1234');
        expect(result.foundUser?.name).toBe('toto');
        expect(result.foundUser?.role).toBe(Role.admin);
        expect(result.user?.name).toBe('toto');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/sql/resolveUser',
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
        );
    });

    it('returns null user when API returns null', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ user: null }),
        });
        const result = await resolveUserFromKey('wrong_key');
        expect(result.foundUser).toBeUndefined();
        expect(result.user).toBeNull();
    });

    it('returns null user on API error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
        });
        const result = await resolveUserFromKey('any_key');
        expect(result.foundUser).toBeUndefined();
        expect(result.user).toBeNull();
    });

    it('returns null user on network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        const result = await resolveUserFromKey('any_key');
        expect(result.foundUser).toBeUndefined();
        expect(result.user).toBeNull();
    });

    it('returns cashier user from API', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ user: { name: 'tata', role: Role.cashier, key: '12345' } }),
        });
        const result = await resolveUserFromKey('12345');
        expect(result.foundUser?.name).toBe('tata');
        expect(result.foundUser?.role).toBe(Role.cashier);
    });

    it('returns service user from API', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ user: { name: 'server', role: Role.service, key: 'svc123' } }),
        });
        const result = await resolveUserFromKey('svc123');
        expect(result.foundUser?.role).toBe(Role.service);
        expect(result.user?.name).toBe('server');
    });

    it('returns kitchen user from API', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ user: { name: 'cook', role: Role.kitchen, key: 'cook123' } }),
        });
        const result = await resolveUserFromKey('cook123');
        expect(result.foundUser?.role).toBe(Role.kitchen);
    });
});

describe('buildParameters', () => {
    const mockUser: User = { name: 'TestUser', role: Role.admin };

    it('uses defaults for empty parameters', () => {
        const result = buildParameters({ keys: [], values: [] }, mockUser, 'test@example.com');
        expect(result.shop.name).toBe('');
        expect(result.shop.email).toBe('test@example.com');
        expect(result.user.name).toBe('TestUser');
        expect(result.mercurial).toBe(Mercurial.none);
        expect(result.closingHour).toBe(0);
        expect(result.yearStartDate!.month).toBe(1);
        expect(result.yearStartDate!.day).toBe(1);
    });

    it('parses parameters by index (legacy format)', () => {
        const result = buildParameters(
            {
                keys: [],
                values: [
                    'MyShop',
                    '123 Main St',
                    '12345',
                    'Paris',
                    'SN001',
                    'shop-123',
                    'shop@example.com',
                    'Thank you!',
                ],
            },
            mockUser
        );
        expect(result.shop.name).toBe('MyShop');
        expect(result.shop.address).toBe('123 Main St');
        expect(result.shop.zipCode).toBe('12345');
        expect(result.shop.city).toBe('Paris');
        expect(result.shop.serial).toBe('SN001');
        expect(result.shop.id).toBe('shop-123');
        expect(result.shop.email).toBe('shop@example.com');
        expect(result.thanksMessage).toBe('Thank you!');
    });

    it('parses parameters by key (new format)', () => {
        const result = buildParameters(
            {
                keys: ['name', 'city', 'email', 'mercurial', 'closingHour'],
                values: ['KeyShop', 'Lyon', 'key@example.com', 'Douce', '22'],
            },
            mockUser
        );
        expect(result.shop.name).toBe('KeyShop');
        expect(result.shop.city).toBe('Lyon');
        expect(result.shop.email).toBe('key@example.com');
        expect(result.mercurial).toBe(Mercurial.soft);
        expect(result.closingHour).toBe(22);
    });

    it('key lookup takes precedence over index', () => {
        const result = buildParameters(
            {
                keys: ['name', 'address'],
                values: ['KeyedName', 'KeyedAddress', 'IndexedName', 'IndexedAddress'],
            },
            mockUser
        );
        expect(result.shop.name).toBe('KeyedName');
        expect(result.shop.address).toBe('KeyedAddress');
    });

    it('parses year start date JSON', () => {
        const result = buildParameters(
            {
                keys: ['yearStartDate'],
                values: ['{"month":4,"day":15}'],
            },
            mockUser
        );
        expect(result.yearStartDate!.month).toBe(4);
        expect(result.yearStartDate!.day).toBe(15);
    });

    it('falls back to default on invalid yearStartDate JSON', () => {
        const result = buildParameters(
            {
                keys: ['yearStartDate'],
                values: ['invalid json'],
            },
            mockUser
        );
        expect(result.yearStartDate!.month).toBe(1);
        expect(result.yearStartDate!.day).toBe(1);
    });

    it('clamps closing hour to valid bounds', () => {
        const resultHigh = buildParameters({ keys: ['closingHour'], values: ['30'] }, mockUser);
        const resultLow = buildParameters({ keys: ['closingHour'], values: ['-5'] }, mockUser);
        expect(resultHigh.closingHour).toBe(23);
        expect(resultLow.closingHour).toBe(0);
    });

    it('uses fallback dev email when email not provided', () => {
        const result = buildParameters({ keys: [], values: [] }, mockUser, 'fallback@dev.com');
        expect(result.shop.email).toBe('fallback@dev.com');
    });
});
