'use client';

import { useState, ChangeEvent, useEffect } from 'react';
import AdminInput from './AdminInput';

interface ValidatedInputProps {
    value: string | number;
    onChange: (value: string | number) => void;
    placeholder?: string;
    validation?: (value: string | number) => boolean;
    type?: string;
    isReadOnly?: boolean;
    maxLength?: number;
    label?: string;
    className?: string;
    min?: number;
    max?: number;
    step?: number;
    onBlur?: () => void;
    onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    ref?: (el: HTMLInputElement | null) => void;
    isNameField?: boolean;
}

export default function ValidatedInput({
    value,
    onChange,
    placeholder,
    validation,
    type = 'text',
    maxLength,
    label,
    className,
    isReadOnly = false,
    min,
    max,
    step,
    onBlur,
    onFocus,
    onKeyDown,
    ref,
    isNameField = false,
}: ValidatedInputProps) {
    // Initialize validation state based on current value
    const [isValid, setIsValid] = useState(() => {
        if (!validation) return true;
        return validation(value);
    });

    // Re-validate when value changes externally
    useEffect(() => {
        if (validation) setIsValid(validation(value));
    }, [value, validation]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (isReadOnly) return;

        let newValue = e.target.value;

        // Handle number fields: accept , or . and remove leading zeros
        if (type === 'number') {
            // Replace comma with dot for decimal separator
            newValue = newValue.replace(',', '.');
            // Remove leading zeros but keep at least one digit
            if (newValue.startsWith('0') && newValue.length > 1 && newValue[1] !== '.') {
                newValue = newValue.replace(/^0+/, '0');
            }
        }

        // Handle text fields (names): reject numbers but don't normalize yet
        if (isNameField) {
            // Reject numbers
            newValue = newValue.replace(/[0-9]/g, '');
        }

        if (validation) setIsValid(validation(newValue));
        onChange(newValue);
    };

    const handleBlur = () => {
        if (isNameField && typeof value === 'string') {
            // Normalize on blur: trim and apply first letter uppercase
            const normalized = value.toFirstUpperCase();
            if (normalized !== value) {
                onChange(normalized);
            }
        }
        if (onBlur) onBlur();
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        e.target.select();
        if (onFocus) onFocus(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.blur();
        }
        if (onKeyDown) onKeyDown(e);
    };

    return (
        <AdminInput
            type={type}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            maxLength={maxLength}
            error={!isValid}
            label={label}
            className={className}
            isReadOnly={isReadOnly}
            min={min}
            max={max}
            step={step}
            onBlur={handleBlur}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            ref={ref}
        />
    );
}
