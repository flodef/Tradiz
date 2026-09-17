'use client';

import { useState, ChangeEvent, useEffect } from 'react';
import AdminInput from './AdminInput';
import { useVirtualKeyboardContext } from './VirtualKeyboardProvider';

interface ValidatedInputProps {
    value: string | number;
    onChange: (value: string | number) => void;
    placeholder?: string;
    validation?: (value: string | number) => boolean;
    filter?: (value: string) => string;
    type?: string;
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
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
    filter,
    type = 'text',
    inputMode,
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
    const vkContext = useVirtualKeyboardContext();
    // Initialize validation state based on current value
    const [isValid, setIsValid] = useState(() => {
        if (!validation) return true;
        return validation(value);
    });

    // While focused, keep a draft value so incomplete decimals like "3."
    // are not stripped by the parent converting to Number().
    const [draftValue, setDraftValue] = useState<string | null>(null);

    // Re-validate when value changes externally
    useEffect(() => {
        if (validation) setIsValid(validation(value));
    }, [value, validation]);

    // Number fields render as text (virtual keyboard) — strip anything that
    // cannot be part of the value: letters, a decimal separator when the
    // step is an integer, a second '.', and '-' when min >= 0.
    const sanitizeNumber = (raw: string): string => {
        let v = raw.replace(/,/g, '.');
        const allowDecimal = !(typeof step === 'number' && Number.isInteger(step));
        const allowNegative = min === undefined || min < 0;
        v = v.replace(allowDecimal ? /[^0-9.-]/g : /[^0-9-]/g, '');
        v = v.replace(/(?!^)-/g, ''); // '-' only allowed in front
        if (!allowNegative) v = v.replace('-', '');
        const dot = v.indexOf('.');
        if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
        // Remove leading zeros but keep at least one digit
        if (v.startsWith('0') && v.length > 1 && v[1] !== '.') {
            v = v.replace(/^0+/, '0');
        }
        // Clamp to max if specified
        if (max !== undefined && v !== '' && v !== '-' && !isNaN(Number(v))) {
            if (Number(v) > max) v = String(max);
        }
        return v;
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (isReadOnly) return;

        let newValue = e.target.value;

        if (type === 'number') {
            newValue = sanitizeNumber(newValue);
        }

        // Handle text fields (names): reject numbers but don't normalize yet
        if (isNameField) {
            // Reject numbers
            newValue = newValue.replace(/[0-9]/g, '');
        }

        // Apply custom filter (e.g. strip invalid chars for phone, VAT, NAF)
        if (filter) {
            newValue = filter(newValue);
        }

        if (validation) setIsValid(validation(newValue));
        setDraftValue(newValue);
        onChange(newValue);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        setDraftValue(null);
        if (isNameField && typeof value === 'string') {
            // Normalize on blur: trim and apply first letter uppercase
            const normalized = value.toFirstUpperCase();
            if (normalized !== value) {
                onChange(normalized);
            }
        }
        if (vkContext) {
            vkContext.unregisterInput(e.target);
            vkContext.registerEnterHandler(null);
        }
        if (onBlur) onBlur();
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        e.target.select();
        if (vkContext) {
            vkContext.registerInput(e.target, (newValue: string) => {
                // Apply the same normalization as handleChange for number fields
                if (type === 'number') {
                    newValue = sanitizeNumber(newValue);
                }
                if (isNameField) {
                    newValue = newValue.replace(/[0-9]/g, '');
                }
                if (filter) {
                    newValue = filter(newValue);
                }
                if (validation) setIsValid(validation(newValue));
                setDraftValue(newValue);
                onChange(newValue);
            });
            vkContext.registerEnterHandler(() => {
                e.target.blur();
            });
        }
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
            type={type === 'number' ? 'text' : type}
            inputMode={inputMode ?? (type === 'number' ? 'decimal' : undefined)}
            value={draftValue !== null ? draftValue : value}
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
