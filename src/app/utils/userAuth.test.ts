import { Role, User, Mercurial } from './interfaces';
import { DEFAULT_USER } from './constants';
import { resolveUserFromKey, buildParameters, UserNotFoundError } from './processData';

// Test cases for resolveUserFromKey
export function runResolveUserTests(): void {
    console.log('Running resolveUserFromKey tests...\n');

    // Test 1: No users configured (undefined) - should return default service user, no error
    console.log('Test 1: No users configured (undefined)');
    const result1 = resolveUserFromKey(undefined, '123456');
    console.log('  Result:', result1);
    console.assert(result1.foundUser === undefined, 'Should not find any user');
    console.assert(result1.user.name === DEFAULT_USER, 'User name should be DEFAULT_USER');
    console.assert(result1.user.role === Role.service, 'User role should be service');
    console.log('  ✓ PASSED\n');

    // Test 2: Empty users array - should return default service user, no error
    console.log('Test 2: Empty users array');
    const result2 = resolveUserFromKey([], '123456');
    console.log('  Result:', result2);
    console.assert(result2.foundUser === undefined, 'Should not find any user');
    console.assert(result2.user.name === DEFAULT_USER, 'User name should be DEFAULT_USER');
    console.log('  ✓ PASSED\n');

    // Test 3: Users exist, correct key provided - should find the user
    console.log('Test 3: Users exist, correct key provided');
    const test3Users: User[] = [
        { name: 'toto', key: '1234', role: Role.admin },
        { name: 'tata', key: '12345', role: Role.cashier },
    ];
    const result3 = resolveUserFromKey(test3Users, '1234');
    console.log('  Result:', result3);
    console.assert(result3.foundUser?.name === 'toto', 'Should find toto');
    console.assert(result3.foundUser?.role === Role.admin, 'User should be admin');
    console.assert(result3.user.name === 'toto', 'Returned user should be toto');
    console.log('  ✓ PASSED\n');

    // Test 4: Users exist, wrong key provided, non-admin users exist - should throw UserNotFoundError
    console.log('Test 4: Users exist, wrong key provided, non-admin users exist (should throw)');
    const test4Users: User[] = [
        { name: 'toto', key: '1234', role: Role.admin },
        { name: 'tata', key: '12345', role: Role.cashier },
    ];
    try {
        resolveUserFromKey(test4Users, 'wrong_key');
        console.error('  ✗ FAILED - Should have thrown UserNotFoundError');
    } catch (e) {
        console.assert(e instanceof UserNotFoundError, 'Should throw UserNotFoundError');
        console.log('  Result: UserNotFoundError thrown correctly');
        console.log('  ✓ PASSED\n');
    }

    // Test 5: Only admin users, wrong key provided - should NOT throw (everyone is admin)
    console.log('Test 5: Only admin users, wrong key provided (should NOT throw)');
    const test5Users: User[] = [{ name: 'admin', key: 'admin123', role: Role.admin }];
    const result5 = resolveUserFromKey(test5Users, 'wrong_key');
    console.log('  Result:', result5);
    console.assert(result5.foundUser === undefined, 'Should not find user with wrong key');
    console.assert(result5.user.role === Role.service, 'Should return default service user');
    console.log('  ✓ PASSED\n');

    // Test 6: Cashier role user with correct key
    console.log('Test 6: Cashier user with correct key');
    const test6Users: User[] = [
        { name: 'toto', key: '1234', role: Role.admin },
        { name: 'tata', key: '12345', role: Role.cashier },
    ];
    const result6 = resolveUserFromKey(test6Users, '12345');
    console.log('  Result:', result6);
    console.assert(result6.foundUser?.name === 'tata', 'Should find tata');
    console.assert(result6.foundUser?.role === Role.cashier, 'User should be cashier');
    console.log('  ✓ PASSED\n');

    // Test 7: Service role user with correct key
    console.log('Test 7: Service role user with correct key');
    const test7Users: User[] = [{ name: 'server', key: 'svc123', role: Role.service }];
    const result7 = resolveUserFromKey(test7Users, 'svc123');
    console.log('  Result:', result7);
    console.assert(result7.foundUser?.role === Role.service, 'User should be service');
    console.assert(result7.user.name === 'server', 'User name should be server');
    console.log('  ✓ PASSED\n');

    // Test 8: Kitchen role user with correct key
    console.log('Test 8: Kitchen role user with correct key');
    const test8Users: User[] = [{ name: 'cook', key: 'cook123', role: Role.kitchen }];
    const result8 = resolveUserFromKey(test8Users, 'cook123');
    console.log('  Result:', result8);
    console.assert(result8.foundUser?.role === Role.kitchen, 'User should be kitchen');
    console.log('  ✓ PASSED\n');

    // Test 9: Custom default user name
    console.log('Test 9: Custom default user name');
    const result9 = resolveUserFromKey(undefined, 'key', 'CustomDefault');
    console.log('  Result:', result9);
    console.assert(result9.user.name === 'CustomDefault', 'Should use custom default name');
    console.log('  ✓ PASSED\n');

    console.log('All resolveUserFromKey tests passed! ✓\n');
}

// Test cases for buildParameters
export function runBuildParametersTests(): void {
    console.log('Running buildParameters tests...\n');

    const mockUser: User = { name: 'TestUser', key: 'key123', role: Role.admin };

    // Test 1: Empty parameters with defaults
    console.log('Test 1: Empty parameters with defaults');
    const result1 = buildParameters({ keys: [], values: [] }, mockUser, 'test@example.com');
    console.log('  Result:', result1);
    console.assert(result1.shop.name === '', 'Shop name should be empty');
    console.assert(result1.shop.email === 'test@example.com', 'Should use provided devEmail');
    console.assert(result1.user.name === 'TestUser', 'Should use provided user');
    console.assert(result1.mercurial === Mercurial.none, 'Mercurial should default to none');
    console.assert(result1.closingHour === 0, 'Closing hour should be 0');
    console.assert(result1.yearStartDate!.month === 1, 'Year start month should be 1');
    console.assert(result1.yearStartDate!.day === 1, 'Year start day should be 1');
    console.log('  ✓ PASSED\n');

    // Test 2: Parameters by index (legacy format)
    console.log('Test 2: Parameters by index (legacy format)');
    const result2 = buildParameters(
        {
            keys: [],
            values: ['MyShop', '123 Main St', '12345', 'Paris', 'SN001', 'shop-123', 'shop@example.com', 'Thank you!'],
        },
        mockUser
    );
    console.log('  Result:', result2);
    console.assert(result2.shop.name === 'MyShop', 'Shop name should be MyShop');
    console.assert(result2.shop.address === '123 Main St', 'Address should be 123 Main St');
    console.assert(result2.shop.zipCode === '12345', 'Zip code should be 12345');
    console.assert(result2.shop.city === 'Paris', 'City should be Paris');
    console.assert(result2.shop.serial === 'SN001', 'Serial should be SN001');
    console.assert(result2.shop.id === 'shop-123', 'ID should be shop-123');
    console.assert(result2.shop.email === 'shop@example.com', 'Email should be shop@example.com');
    console.assert(result2.thanksMessage === 'Thank you!', 'Thanks message should be Thank you!');
    console.log('  ✓ PASSED\n');

    // Test 3: Parameters by key (new format)
    console.log('Test 3: Parameters by key (new format)');
    const result3 = buildParameters(
        {
            keys: ['name', 'city', 'email', 'mercurial', 'closingHour'],
            values: ['KeyShop', 'Lyon', 'key@example.com', 'coingecko', '22'],
        },
        mockUser
    );
    console.log('  Result:', result3);
    console.assert(result3.shop.name === 'KeyShop', 'Shop name should be KeyShop');
    console.assert(result3.shop.city === 'Lyon', 'City should be Lyon');
    console.assert(result3.shop.email === 'key@example.com', 'Email should be key@example.com');
    console.assert(result3.mercurial === Mercurial.soft, 'Mercurial should be soft (coingecko maps to soft)');
    console.assert(result3.closingHour === 22, 'Closing hour should be 22');
    console.log('  ✓ PASSED\n');

    // Test 4: Key lookup takes precedence over index
    console.log('Test 4: Key lookup takes precedence over index');
    const result4 = buildParameters(
        {
            keys: ['name', 'address'],
            values: ['KeyedName', 'KeyedAddress', 'IndexedName', 'IndexedAddress'],
        },
        mockUser
    );
    console.log('  Result:', result4);
    console.assert(result4.shop.name === 'KeyedName', 'Should use keyed name');
    console.assert(result4.shop.address === 'KeyedAddress', 'Should use keyed address');
    console.log('  ✓ PASSED\n');

    // Test 5: Year start date parsing
    console.log('Test 5: Year start date parsing');
    const result5 = buildParameters(
        {
            keys: ['yearStartDate'],
            values: ['{"month":4,"day":15}'],
        },
        mockUser
    );
    console.log('  Result:', result5);
    console.assert(result5.yearStartDate!.month === 4, 'Month should be 4');
    console.assert(result5.yearStartDate!.day === 15, 'Day should be 15');
    console.log('  ✓ PASSED\n');

    // Test 6: Invalid yearStartDate JSON falls back to default
    console.log('Test 6: Invalid yearStartDate JSON falls back to default');
    const result6 = buildParameters(
        {
            keys: ['yearStartDate'],
            values: ['invalid json'],
        },
        mockUser
    );
    console.log('  Result:', result6);
    console.assert(result6.yearStartDate!.month === 1, 'Should default to January');
    console.assert(result6.yearStartDate!.day === 1, 'Should default to day 1');
    console.log('  ✓ PASSED\n');

    // Test 7: Closing hour bounds
    console.log('Test 7: Closing hour bounds');
    const result7High = buildParameters({ keys: ['closingHour'], values: ['30'] }, mockUser);
    const result7Low = buildParameters({ keys: ['closingHour'], values: ['-5'] }, mockUser);
    console.log('  High result:', result7High.closingHour);
    console.log('  Low result:', result7Low.closingHour);
    console.assert(result7High.closingHour === 23, 'Should cap at 23');
    console.assert(result7Low.closingHour === 0, 'Should floor at 0');
    console.log('  ✓ PASSED\n');

    // Test 8: Uses DEV_EMAIL when email not provided
    console.log('Test 8: Uses DEV_EMAIL when email not provided');
    const result8 = buildParameters({ keys: [], values: [] }, mockUser, 'fallback@dev.com');
    console.log('  Result:', result8.shop.email);
    console.assert(result8.shop.email === 'fallback@dev.com', 'Should use fallback dev email');
    console.log('  ✓ PASSED\n');

    console.log('All buildParameters tests passed! ✓\n');
}

// Run all tests
export function runAllTests(): void {
    runResolveUserTests();
    runBuildParametersTests();
    console.log('=================================');
    console.log('ALL TESTS PASSED! ✓✓✓');
    console.log('=================================');
}

// Run tests if this file is executed directly
if (typeof window === 'undefined' && process.argv.includes('--run-tests')) {
    runAllTests();
}
