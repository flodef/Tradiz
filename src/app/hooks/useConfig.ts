import { createContext, useContext } from 'react';
import { Config, Parameters } from '../contexts/ConfigProvider';
import {
    Currency,
    Customer,
    PaymentMethod,
    InventoryItem,
    Discount,
    Color,
    Printer,
    State,
    User,
    CategoryData,
} from '../utils/interfaces';

export type OperationMode = 'restaurant' | 'fastfood' | 'lite';

export interface ConfigContextState {
    state: State;
    setState: (value: State) => void;
    setConfig: (value: Config | undefined) => void;
    isStateReady: boolean;
    modeFonctionnement: OperationMode;
    isFastFood: boolean;
    isKitchenViewEnabled: boolean;
    isGrafanaAccessEnabled: boolean;
    parameters: Parameters;
    setParameters: (value: Parameters) => void;
    currencyIndex: number;
    setCurrency: (label: string) => void;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
    discounts: Discount[];
    colors: Color[];
    printers: Printer[];
    getPrintersNames: () => string[];
    resolvePrinterAddresses: (name?: string) => string[];
    getPrinterAddressByRole: (role: string) => string | undefined;
    getPrinterNamesByRole: (role: string) => string[];
    customers: Customer[];
    setCustomers: (value: Customer[] | ((prev: Customer[]) => Customer[])) => void;
    users: User[];
    categories: CategoryData[];
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
