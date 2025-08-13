import ValidatedInput from '../ValidatedInput';
import ColorPicker from '../ColorPicker';
import { Color } from '@/app/hooks/useConfig';

interface ColorItemProps {
    color: Color;
    onChange: (color: Color) => void;
    onDelete: () => void;
}

export default function ColorItem({ color, onChange, onDelete }: ColorItemProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-4">
            <div className="flex justify-end">
                <button
                    onClick={onDelete}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600"
                >
                    Supprimer
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
                    <ValidatedInput
                        value={color.label}
                        onChange={(value) => onChange({ ...color, label: String(value) })}
                        placeholder="Label de la couleur"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Light</label>
                    <ColorPicker color={color.light} onChange={(value) => onChange({ ...color, light: value })} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dark</label>
                    <ColorPicker color={color.dark} onChange={(value) => onChange({ ...color, dark: value })} />
                </div>
            </div>
        </div>
    );
}
