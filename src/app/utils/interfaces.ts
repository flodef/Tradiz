export enum Role {
    cashier = 'Cashier',
    service = 'Service',
    kitchen = 'Kitchen',
    admin = 'Admin',
}

export enum State {
    init,
    loading,
    error,
    fatal,
    unidentified,
    missingData,
    preloaded,
    loaded,
}

export enum Mercurial {
    none = 'Aucune',
    exponential = 'Exponentielle',
    soft = 'Douce',
    zelet = 'Zelet',
}

export interface Category {
    label: string;
    vat: number | null;
    company?: string | null;
    printerLabel?: string | null;
    sortOrder?: number;
}

export interface CategoryData {
    id: number;
    name: string;
    company: string | null;
    printer?: string | null;
    sortOrder: number;
}

export interface User {
    id?: number;
    name: string;
    role: Role;
    reference?: string;
}

export interface Device {
    id?: number;
    label: string;
    key: string;
    userId?: number;
    backscreenCom?: string | null;
    backscreenBaud?: number | null;
    printerCom?: string | null;
    printerBaud?: number | null;
    cashDrawerCom?: string | null;
    cashDrawerBaud?: number | null;
}

export interface Company {
    id?: number;
    name: string;
    employerShare: number;
    siret?: string;
    vatNumber?: string;
    address?: string;
    zipCode?: string;
    city?: string;
}

export interface BillingReport {
    companyId: number;
    companyName: string;
    companySiret?: string;
    companyVatNumber?: string;
    companyAddress?: string;
    companyZipCode?: string;
    companyCity?: string;
    startDate: string;
    endDate: string;
    employerShare: number;
    vatRate: number;
    mealCount: number;
    totalAmount: number;
    totalHT: number;
    totalTVA: number;
    customers: BillingReportCustomer[];
}

export interface BillingReportCustomer {
    customerId: number;
    reference?: string;
    firstName: string;
    lastName: string;
    mealCount: number;
    totalAmount: number;
    totalHT: number;
    totalTVA: number;
}

export interface Customer {
    id?: number;
    firstName: string;
    lastName: string;
    reference?: string;
    email?: string;
    phone?: string;
    company?: string;
    balance?: number;
    fidelityPoints?: number;
}

export interface Currency {
    label: string;
    maxValue: number;
    symbol: string;
    decimals: number;
    rate: number;
    fee: number;
}

export interface PaymentMethod {
    type: string;
    id?: string;
    currency: string;
    availability: boolean;
}

export interface InventoryItem {
    category: string;
    rate: number;
    order: number;
    products: {
        label: string;
        prices: number[];
        options?: string | null;
        stock: number | null;
        order: number;
        reference?: string | null;
        color?: string;
        sortOrder?: number;
        employerShare?: number | null;
    }[];
}

export interface Discount {
    amount: number;
    unit: string;
}
export const EmptyDiscount: Discount = { amount: 0, unit: '' };

export interface Color {
    label: string;
    light: string;
    dark: string;
}

export interface Printer {
    label: string;
    ipAddress: string;
}

export enum SyncAction {
    none,
    fullsync,
    daysync,
    export,
    import,
}

export enum SyncPeriod {
    day,
    full,
}

export type DataElement = {
    category: string;
    quantity: number;
    amount: number;
};

export type Product = DataElement & {
    label: string;
    total?: number;
    discount: Discount;
    mercurial?: Mercurial;
    options?: string;
    vatRate?: number;
    employerShare?: number;
};

export type Transaction = {
    validator: string;
    method: string;
    amount: number;
    createdDate: number;
    modifiedDate: number;
    currency: string;
    products: Product[];
    shortNumOrder?: string;
    customerName?: string;
    previousBalance?: number;
    newBalance?: number;
    cashAmount?: number;
    change?: number;
    takeOut?: boolean;
    employerShare?: number;
    fidelityPointsUsed?: number;
    deviceId?: string;
};

export type TransactionSet = {
    id: string;
    transactions: Transaction[];
};

// Order item types for partial payment
export interface OrderArticle {
    id: string;
    type: 'article';
    label: string;
    quantity: number;
    price: number;
    category: string;
    options?: string;
    paid_at?: string | null;
    kitchen_view: number;
}

export interface OrderFormule {
    id: string;
    type: 'formule';
    label: string;
    quantity: number;
    price: number;
    note?: string;
    paid_at?: string | null;
    elements: {
        category: string;
        choice: string;
        options?: string;
    }[];
}

export type OrderItem = OrderArticle | OrderFormule;

export type ServiceType = 'dine_in' | 'takeout';

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
    dine_in: 'Sur place',
    takeout: 'À emporter',
};

const DB_TO_SERVICE_TYPE: Record<string, ServiceType> = {
    on_site: 'dine_in',
    takeaway: 'takeout',
};

const SERVICE_TYPE_TO_DB: Record<ServiceType, string> = {
    dine_in: 'on_site',
    takeout: 'takeaway',
};

export function dbToServiceType(dbValue: string): ServiceType {
    return DB_TO_SERVICE_TYPE[dbValue] ?? 'dine_in';
}

export function serviceTypeToDb(type: ServiceType): string {
    return SERVICE_TYPE_TO_DB[type] ?? 'on_site';
}

export interface OrderData {
    order_id: number;
    short_num_order: string;
    service_type: ServiceType;
    items: OrderItem[];
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
}

// ── Catalog: article & formula definitions used for option/element selection ──

export interface CatalogArticle {
    id: number;
    nom: string;
    prix: number;
    categorie: string;
    /** JSON: [{type, options:[{valeur, prix}]}] */
    options: string | null;
}

export interface CatalogFormulaElement {
    id: string;
    nom: string;
    category?: string;
    articles: Omit<CatalogArticle, 'categorie'>[];
}

export interface CatalogFormula {
    id: string;
    nom: string;
    prix: number;
    elements: CatalogFormulaElement[];
}

export interface Catalog {
    articles: CatalogArticle[];
    formulas: CatalogFormula[];
}
