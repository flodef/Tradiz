'use client';

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    disabled?: boolean;
}

export default function ColorPicker({ color, onChange, disabled = false }: ColorPickerProps) {
    return (
        <div className="flex items-center space-x-2">
            <input
                type="color"
                value={color}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={`w-16 h-8 p-1 border border-gray-300 rounded-md cursor-pointer dark:border-gray-600 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <span
                className={`font-mono text-sm uppercase text-gray-700 dark:text-gray-300 ${disabled ? 'opacity-50' : ''}`}
            >
                {color}
            </span>
        </div>
    );
}
