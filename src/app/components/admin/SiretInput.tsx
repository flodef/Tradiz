'use client';

import { useEffect } from 'react';
import AdminInput from './AdminInput';

/**
 * SIRET (Système d'Identification du Répertoire des Établissements):
 * - Exactly 14 digits (SIREN 9 digits + NIC 5 digits)
 * - Validated by the Luhn algorithm (same as used by INSEE)
 */

const SIRET_REGEX = /^\d{0,14}$/;

function luhnCheck(value: string): boolean {
    if (value.length !== 14) return false;
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        let digit = parseInt(value[i], 10);
        if (i % 2 === 0) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    return sum % 10 === 0;
}

interface SiretInputProps {
    value: string;
    onChange: (value: string) => void;
    onValidation?: (isValid: boolean) => void;
    disabled?: boolean;
}

export default function SiretInput({ value, onChange, onValidation, disabled = false }: SiretInputProps) {
    const isValid = luhnCheck(value);

    useEffect(() => {
        onValidation?.(isValid);
    }, [isValid, onValidation]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (SIRET_REGEX.test(val)) onChange(val);
    };

    return (
        <div className="flex flex-col gap-0.5">
            <AdminInput
                label="SIRET"
                type="text"
                inputMode="numeric"
                maxLength={14}
                value={value}
                onChange={handleChange}
                disabled={disabled}
                placeholder="12345678901234"
                error={!isValid}
                className="w-44"
            />
        </div>
    );
}
