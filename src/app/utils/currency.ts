'use client';

import { ConfigProvider } from '../contexts/ConfigProvider'; // Hack to be able to use the global context in this file

declare global {
    interface Number {
        toCurrency(maxDecimals: number, currency: string): string;
    }
    interface String {
        fromCurrency(): number;
    }
}

Number.prototype.toCurrency = function (maxDecimals: number, currency: string): string {
    return `${this.toFixed(maxDecimals)}${currency}`;
};

String.prototype.fromCurrency = function (): number {
    return parseFloat(this.trim().replace(/[^\d.-]/g, '')); // eslint-disable-line no-useless-escape
};
