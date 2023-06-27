import { createContext, ReactElement, useContext } from 'react';

export type Digits = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export enum Theme {
    Classic = 'classic',
    Color = 'color',
    BlackWhite = 'blackWhite',
}

interface ConfigContextState {
    // link: URL | undefined;
    // label: string;
    // message?: string;
    // icon: ReactElement;
    // decimals: Digits;
    minDecimals: Digits;
    maxDecimals: Digits;
    maxValue: number;
    currency: string;
    // id?: number;
    theme: string;
    // changeTheme: () => void;
    // reset: () => void;
}

export const ConfigContext = createContext<ConfigContextState>({} as ConfigContextState);

export function useConfig(): ConfigContextState {
    return useContext(ConfigContext);
}
