import { createContext, useContext } from 'react';
import { Parameters } from '../contexts/ConfigProvider';
import { Currency, PaymentMethod, InventoryItem, Discount, Color, State } from '../utils/interfaces';

export interface ConfigContextState {
    state: State;
    setState: (value: State) => void;
    isStateReady: boolean;
    isFastFood: boolean;
    parameters: Parameters;
    currencyIndex: number;
    setCurrency: (label: string) => void;
    currencies: Currency[];
    paymentMethods: PaymentMethod[];
    inventory: InventoryItem[];
    discounts: Discount[];
    colors: Color[];
    getPrintersNames: () => string[];
    getPrinterAddresses: (name?: string) => string[];
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
