import { Color } from '@/app/utils/interfaces';
import ColorPicker from '../ColorPicker';

interface ColorItemProps {
    color: Color;
    onChange: (color: Color) => void;
    onDelete: () => void;
    isReadOnly: boolean;
}

export default function ColorItem({ color, onChange, isReadOnly }: ColorItemProps) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
                    <div className="h-[42px] flex items-center px-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {color.label}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Light</label>
                    <ColorPicker
                        color={color.light}
                        onChange={(value) => onChange({ ...color, light: value })}
                        isReadOnly={isReadOnly}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dark</label>
                    <ColorPicker
                        color={color.dark}
                        onChange={(value) => onChange({ ...color, dark: value })}
                        isReadOnly={isReadOnly}
                    />
                </div>
            </div>
        </div>
    );
}
