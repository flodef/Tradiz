'use client';

import { MinMax, SymbolPosition } from './types';

// Extend prototype
declare global {
    interface Number {
        toLocaleCurrency(currency?: string): string;
        toShortCurrency(maxDecimals?: number, symbol?: string): string;
        toCurrency(maxDecimals?: number, symbol?: string): string;
        toRatio(maxDecimals?: number): string;
        toLocaleDateString(): string;
        toShortFixed(maxDecimals?: number): string;
        toDecimalPlace(decimalPlace?: number, direction?: RoundingDirection): number;
        toClosestPowerOfTen(direction?: RoundingDirection): number;
    }
    interface String {
        fromCurrency(locale?: string): number;
        toFirstUpperCase(): string;
        testLimit(limit: MinMax): boolean;
    }
    interface Date {
        toShortDate(): string;
        toLongDate(): string;
    }
    interface Array<T> {
        removeHeader(): Array<T>;
        removeEmpty(...index: (undefined | number | number[])[]): Array<T>;
    }
}

Number.prototype.toLocaleCurrency = function (currency = 'EUR') {
    let value = Intl.NumberFormat(navigator.language, {
        style: 'currency',
        currency: currency,
    }).format(Number(this));

    if (this && /^(?:\D*0(?:\.\d{1,2})?)\D*$/.test(value)) {
        const significantDigits = this.toPrecision(2); // Get the significant digits
        value = value.replace('00', parseFloat(significantDigits).toString().slice(2)); // Convert to string and remove trailing zeros
    }

    return value;
};

Number.prototype.toShortCurrency = function (maxDecimals = 0, symbol = '€') {
    return (
        this.toShortFixed(maxDecimals)
            .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
            .replace(/ 000 000/, 'M')
            .replace(/ 000/, 'K') + (symbol ? (Number(this) < 1000 ? ' ' : '') + symbol : '')
    );
};

Number.prototype.toCurrency = function (maxDecimals = 2, symbol = '€', symbolPosition: SymbolPosition = 'after') {
    return `${symbolPosition === 'before' ? symbol : ''}${this.toFixed(maxDecimals)}${symbolPosition === 'after' ? symbol : ''}`;
};

Number.prototype.toRatio = function (maxDecimals = 2) {
    return `${(Number(this) * 100).toFixed(maxDecimals)}%`;
};

Number.prototype.toLocaleDateString = function () {
    return new Date(Math.round((Number(this) - 25569) * 86400 * 1000)).toShortDate();
};

Number.prototype.toShortFixed = function (maxDecimals = 2) {
    return Number.isInteger(this) ? this.toString() : this.toFixed(maxDecimals);
};

export type RoundingDirection = 'up' | 'down';
Number.prototype.toDecimalPlace = function (decimalPlace = 2, direction: RoundingDirection = 'up') {
    const multiplier = 10 ** decimalPlace;
    const roundedValue =
        direction === 'up' ? Math.ceil(Number(this) * multiplier) : Math.floor(Number(this) * multiplier);
    return roundedValue / multiplier;
};

Number.prototype.toClosestPowerOfTen = function (direction: RoundingDirection = 'down') {
    if (Math.abs(Number(this)) < 10) return direction === 'down' ? 0 : 1;

    let absNumber = Math.abs(Number(this));
    let power = 1;

    while (absNumber >= 100) {
        absNumber /= 10;
        power++;
    }

    return Math.pow(10, direction === 'down' ? power : power + 1);
};

String.prototype.fromCurrency = function (locale?: string) {
    const number = (locale ?? Intl.NumberFormat(navigator.language).resolvedOptions().locale).startsWith('fr')
        ? this.replace(/,/g, '.')
        : this.replace(/,/g, '');
    return parseFloat(number.replace(/[^0-9\.\-]/g, ''));
};

String.prototype.toFirstUpperCase = function () {
    const label = this.trim();
    return label.charAt(0).toUpperCase() + label.slice(1);
};

String.prototype.testLimit = function (limit: MinMax) {
    return this.length >= limit.min && this.length <= limit.max;
};

Date.prototype.toShortDate = function () {
    return this.toLocaleDateString(navigator.language, { year: 'numeric', month: 'numeric', day: 'numeric' });
};

Date.prototype.toLongDate = function () {
    return this.toLocaleString(navigator.language);
};

Array.prototype.removeHeader = function () {
    return this.filter((_, i) => i !== 0);
};

Array.prototype.removeEmpty = function (...index: (undefined | number | number[])[]) {
    return this.filter((item) => {
        if (!(item instanceof Array) || index === undefined) {
            return !!item;
        } else {
            let indexes: number[] = [];
            if (index.length === 1 && typeof index[0] === 'number') {
                // Handle the case with a single number
                indexes = [index[0]];
            } else if (index.length === 1 && Array.isArray(index[0])) {
                // Handle the case with an array of numbers
                indexes = index[0];
            } else if (index.length) {
                // Handle the case with multiple numbers
                indexes = index.flat() as number[];
            }

            return indexes.length ? indexes.every((i) => !!item.at(i) || i > item.length) : item.every((i) => !!i);
        }
    });
};
