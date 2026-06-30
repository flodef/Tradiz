'use client';

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    isReadOnly?: boolean;
}

export default function ColorPicker({ color, onChange, isReadOnly = false }: ColorPickerProps) {
    return (
        <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            disabled={isReadOnly}
            className={`w-full h-[42px] p-1 border border-gray-300 rounded-md cursor-pointer dark:border-gray-600 ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
    );
}
