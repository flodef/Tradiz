'use client';

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    disabled?: boolean;
}

export default function ColorPicker({ color, onChange, disabled = false }: ColorPickerProps) {
    return (
        <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={`w-full h-[42px] p-1 border border-gray-300 rounded-md cursor-pointer dark:border-gray-600 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
    );
}
