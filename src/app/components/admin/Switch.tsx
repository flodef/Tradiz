'use client';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    isReadOnly?: boolean;
    label?: string;
}

export default function Switch({ checked, onChange, isReadOnly = false, label }: SwitchProps) {
    return (
        <label
            className={`relative inline-flex items-center gap-3 ${isReadOnly ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        >
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => !isReadOnly && onChange(e.target.checked)}
                disabled={isReadOnly}
                className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            {label && <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>}
        </label>
    );
}
