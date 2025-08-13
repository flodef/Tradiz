'use client';

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
}

export default function ColorPicker({ color, onChange }: ColorPickerProps) {
    return (
        <div className="flex items-center space-x-2">
            <input
                type="color"
                value={color}
                onChange={(e) => onChange(e.target.value)}
                className="w-16 h-8 p-1 border border-gray-300 rounded-md cursor-pointer dark:border-gray-600"
            />
            <span className="font-mono text-sm uppercase text-gray-700 dark:text-gray-300">{color}</span>
        </div>
    );
}