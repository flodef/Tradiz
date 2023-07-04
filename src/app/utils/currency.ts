import { currency, maxDecimals } from './data';

declare global {
    interface Number {
        toCurrency(): string;
    }
}

Number.prototype.toCurrency = function (): string {
    return `${this.toFixed(maxDecimals)}${currency}`;
};
