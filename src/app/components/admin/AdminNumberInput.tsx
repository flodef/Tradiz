'use client';

import React from 'react';
import ValidatedInput from './ValidatedInput';

type BaseProps = Omit<React.ComponentProps<typeof ValidatedInput>, 'type' | 'filter' | 'isNameField' | 'step'>;

interface AdminNumberInputProps extends BaseProps {
    step?: number | 'any';
}

/**
 * Numeric admin field. Renders as text (so the virtual keyboard opens and
 * letters can't be typed — ValidatedInput strips them), clamps to min/max
 * and snaps to `step` on blur. Use this instead of `AdminInput type="number"`,
 * which neither filters letters nor triggers the virtual keyboard.
 */
export default function AdminNumberInput({ min, max, step, onBlur, ...props }: AdminNumberInputProps) {
    const numericStep = typeof step === 'number' ? step : undefined;

    const handleBlur = () => {
        const n = Number(props.value);
        if (props.value !== '' && !isNaN(n)) {
            let snapped = n;
            if (min !== undefined) snapped = Math.max(min, snapped);
            if (max !== undefined) snapped = Math.min(max, snapped);
            if (numericStep) snapped = Math.round(snapped / numericStep) * numericStep;
            snapped = Number(snapped.toFixed(6)); // float dust (e.g. 0.1+0.2)
            if (snapped !== n) props.onChange(snapped);
        }
        onBlur?.();
    };

    return <ValidatedInput {...props} type="number" min={min} max={max} step={numericStep} onBlur={handleBlur} />;
}
