import { test as base, expect, type Page } from '@playwright/test';

// ── Mock data ──
// Each response matches the format expected by the convert* functions
// in src/app/utils/processData.ts

const mockParameters = [
    { key: 'name', value: 'Test Shop' },
    { key: 'address', value: '1 Test Street' },
    { key: 'zipCode', value: '75001' },
    { key: 'city', value: 'Paris' },
    { key: 'serial', value: 'TEST001' },
    { key: 'id', value: '1' },
    { key: 'email', value: 'test@tradiz.fr' },
    { key: 'thanksMessage', value: 'Merci !' },
    { key: 'closingHour', value: '23' },
    { key: 'yearStartDate', value: '{"month":1,"day":1}' },
    { key: 'lastModified', value: String(Date.now()) },
    { key: 'productsSettings', value: '{"useOptions":false,"useStock":true}' },
    {
        key: 'displaySettings',
        value: '{"showChange":true,"showWaiting":true,"showRefund":true,"showDebit":true,"displayOthers":true,"catalogMode":false,"useTakeOut":false,"paymentIconsMode":false}',
    },
    { key: 'userSwitch', value: 'true' },
    { key: 'fidelityRate', value: '0' },
];

const mockPaymentMethods = [
    { id: 1, type: 'Carte Bancaire', currency: 'EUR', availability: true },
    { id: 2, type: 'Espèces', currency: 'EUR', availability: true },
    { id: 3, type: 'Chèque', currency: 'EUR', availability: true },
];

const mockCurrencies = [{ label: 'EUR', decimals: 2, symbol: '€', maxValue: 999.99, rate: 1 }];

const mockColors = [
    { label: 'Texte', light: '#d97706', dark: '#facc15' },
    { label: 'Fond début', light: '#fff7ed', dark: '#65a30d' },
    { label: 'Fond fin', light: '#fed7aa', dark: '#14532d' },
    { label: 'Popup', light: '#f1f5f9', dark: '#713f12' },
    { label: 'Activé', light: '#fdba74', dark: '#84cc16' },
    { label: 'Secondaire', light: '#84cc16', dark: '#fdba74' },
    { label: 'Secondaire activé', light: '#a3e635', dark: '#f97316' },
];

// RawProduct format — flat list, rate is decimal (0.20 for 20%)
const mockProducts = [
    {
        rate: 0.2,
        category: 'Boissons',
        label: 'Coca',
        stock: 10,
        reference: null,
        photo: '',
        description: '',
        color: '',
        prices: [2.5],
        options: null,
        sortOrder: 0,
        employerShare: null,
    },
    {
        rate: 0.2,
        category: 'Boissons',
        label: 'Eau',
        stock: 20,
        reference: null,
        photo: '',
        description: '',
        color: '',
        prices: [1.5],
        options: null,
        sortOrder: 1,
        employerShare: null,
    },
    {
        rate: 0.1,
        category: 'Plats',
        label: 'Pizza',
        stock: 5,
        reference: null,
        photo: '',
        description: '',
        color: '',
        prices: [12],
        options: null,
        sortOrder: 0,
        employerShare: null,
    },
    {
        rate: 0.1,
        category: 'Plats',
        label: 'Salade',
        stock: 5,
        reference: null,
        photo: '',
        description: '',
        color: '',
        prices: [8],
        options: null,
        sortOrder: 1,
        employerShare: null,
    },
    {
        rate: 0.2,
        category: 'Boissons',
        label: 'Jus',
        stock: 1,
        reference: null,
        photo: '',
        description: '',
        color: '',
        prices: [3],
        options: null,
        sortOrder: 2,
        employerShare: null,
    },
];

const mockCategories = [
    { name: 'Boissons', company: null, printer: null, sortOrder: 0 },
    { name: 'Plats', company: null, printer: null, sortOrder: 1 },
];

const mockUsers = [{ id: 1, name: 'Test User', role: 'admin', reference: 'test' }];

// ── API mock setup ──

async function mockApiRoutes(page: Page) {
    // Intercept all API calls and return mock data
    await page.route('**/api/sql/getEtabConfig', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                mode_fonctionnement: 'lite',
                kitchen_view_enabled: false,
                grafana_access_enabled: false,
            }),
        });
    });

    await page.route('**/api/sql/getDeviceHardware**', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    // The loadData function fetches from multiple endpoints. We intercept
    // the generic data endpoints used by fetchData().
    await page.route('**/api/sql/getParameters', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ parameters: mockParameters }),
        });
    });

    await page.route('**/api/sql/getPaymentMethods', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ paymentMethods: mockPaymentMethods }),
        });
    });

    await page.route('**/api/sql/getCurrencies', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ currencies: mockCurrencies }),
        });
    });

    await page.route('**/api/sql/getDiscounts', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ discounts: [] }) });
    });

    await page.route('**/api/sql/getColors', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ colors: mockColors }),
        });
    });

    await page.route('**/api/sql/getPrinters', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ printers: [] }) });
    });

    await page.route('**/api/sql/getCategories', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ categories: mockCategories }),
        });
    });

    await page.route('**/api/sql/getAllArticles', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ products: mockProducts, currencies: ['EUR'] }),
        });
    });

    await page.route('**/api/sql/getCustomers', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customers: [] }) });
    });

    await page.route('**/api/sql/getUsers', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ users: mockUsers }),
        });
    });

    // Resolve user by public key — return the test user
    await page.route('**/api/sql/resolveUser**', (route) => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user: mockUsers[0], noUsers: false }),
        });
    });

    // Check DB config
    await page.route('**/api/sql/getDbConfig', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"hasDbConfig":true}' });
    });

    // Transactions — return empty list so the app loads without DB errors
    await page.route('**/api/sql/getTransactions**', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transactions: [] }) });
    });

    // Save transaction — accept silently
    await page.route('**/api/sql/saveTransaction', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
    });

    // Companies
    await page.route('**/api/sql/getCompanies', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ companies: [] }) });
    });

    // Log software version
    await page.route('**/api/sql/logSoftwareVersion', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
}

// ── Custom test fixture with API mocking ──

const test = base.extend<{
    mockedPage: Page;
}>({
    // eslint-disable-next-line react-hooks/rules-of-hooks
    mockedPage: async ({ page }, use) => {
        await mockApiRoutes(page);
        await use(page);
    },
});

export { test, expect, mockApiRoutes };
