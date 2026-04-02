'use client';

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
        // For SIRET: double every odd-positioned digit (0-indexed even positions from left = odd positions in Luhn)
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
    disabled?: boolean;
}

export default function SiretInput({ value, onChange, disabled = false }: SiretInputProps) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (SIRET_REGEX.test(val)) onChange(val);
    };

    const isValid = value === '' || luhnCheck(value);
    const isComplete = value.length === 14;

    const borderClass =
        !isComplete || isValid
            ? 'border-gray-300 dark:border-gray-600'
            : 'border-red-500 dark:border-red-400';

    return (
        <div className="flex flex-col gap-0.5">
            <input
                type="text"
                inputMode="numeric"
                maxLength={14}
                value={value}
                onChange={handleChange}
                disabled={disabled}
                placeholder="12345678901234"
                className={`w-44 px-3 py-2 border rounded-md bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed ${borderClass}`}
            />
            {isComplete && !isValid && (
                <span className="text-xs text-red-500 dark:text-red-400">SIRET invalide</span>
            )}
        </div>
    );
}
