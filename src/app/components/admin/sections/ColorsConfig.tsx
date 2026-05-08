import { adminBaseStyle, adminHeaderStyle } from '@/app/utils/constants';
import { Color } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import AdminButton from '../AdminButton';
import ColorPicker from '../ColorPicker';
import DeleteButton from '../DeleteButton';
import SectionCard from '../SectionCard';
import ValidatedInput from '../ValidatedInput';

export default function ColorsConfig({
    config,
    onChange,
    onSave,
    isReadOnly = false,
    themeName,
    onThemeNameChange,
    onCancel,
    isLoading = false,
}: {
    config: Color[];
    onChange: (data: Color[]) => void;
    onSave?: (data: Color[]) => void;
    isReadOnly?: boolean;
    themeName?: string;
    onThemeNameChange?: (name: string) => void;
    onCancel?: () => void;
    isLoading?: boolean;
}) {
    const [colors, setColors] = useState(config || []);

    useEffect(() => {
        setColors(config || []);
    }, [config]);

    const handleColorChange = (index: number, updatedColor: Color) => {
        const newColors = [...colors];
        newColors[index] = updatedColor;
        setColors(newColors);
        onChange(newColors);
    };

    const handleAddTheme = () => {
        // Add a new theme with default colors
        const defaultTheme: Color[] = [
            { label: 'Texte', light: '#000000', dark: '#FFFFFF' },
            { label: 'Fond début dégradé', light: '#FFFFFF', dark: '#1F2937' },
            { label: 'Fond fin dégradé', light: '#F3F4F6', dark: '#111827' },
            { label: 'Popup', light: '#FFFFFF', dark: '#374151' },
            { label: 'Activé', light: '#3B82F6', dark: '#60A5FA' },
            { label: 'Secondaire', light: '#6B7280', dark: '#9CA3AF' },
            { label: 'Secondaire activé', light: '#10B981', dark: '#34D399' },
        ];
        const updated = [...colors, ...defaultTheme];
        setColors(updated);
        onChange(updated);
    };

    // Group colors by theme (every 7 colors is one theme)
    const themes: Color[][] = [];
    for (let i = 0; i < colors.length; i += 7) {
        themes.push(colors.slice(i, i + 7));
    }

    return (
        <SectionCard
            title="Thèmes"
            onSave={isReadOnly ? undefined : onSave ? () => onSave(colors) : undefined}
            onCancel={onCancel}
            isLoading={isLoading}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {themes.map((theme, themeIndex) => (
                    <div
                        key={themeIndex}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 relative min-w-0"
                    >
                        {!isReadOnly && themes.length > 1 && (
                            <DeleteButton
                                onClick={() => {
                                    // Remove this theme (7 colors)
                                    const startIdx = themeIndex * 7;
                                    const newColors = colors.filter((_, i) => i < startIdx || i >= startIdx + 7);
                                    setColors(newColors);
                                    onChange(newColors);
                                }}
                                title="Supprimer le thème"
                            />
                        )}
                        {themeIndex === 0 && !isReadOnly ? (
                            <div>
                                <ValidatedInput
                                    label="Thème"
                                    type="text"
                                    value={themeName || 'Défaut'}
                                    onChange={(value) => onThemeNameChange?.(String(value))}
                                    maxLength={50}
                                    className={'min-w-40 w-40'}
                                />
                            </div>
                        ) : (
                            <h3 className={adminBaseStyle}>
                                {themeIndex === 0 ? themeName || 'Thème 1' : `Thème ${themeIndex + 1}`}
                            </h3>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                        <th className={adminHeaderStyle + ' py-2'}>Couleur</th>
                                        <th className={adminHeaderStyle + ' py-2 min-w-20'}>Clair</th>
                                        <th className={adminHeaderStyle + ' py-2 min-w-20'}>Sombre</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {theme.map((color, colorIndex) => {
                                        const globalIndex = themeIndex * 7 + colorIndex;
                                        return (
                                            <tr
                                                key={colorIndex}
                                                className={
                                                    colorIndex === theme.length - 1
                                                        ? ''
                                                        : 'border-b border-gray-200 dark:border-gray-700'
                                                }
                                            >
                                                <td className="p-2">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                        {color.label}
                                                    </div>
                                                </td>
                                                <td className="p-2">
                                                    {isReadOnly ? (
                                                        <div
                                                            className="w-full h-8 rounded border border-gray-300 dark:border-gray-600"
                                                            style={{ backgroundColor: color.light }}
                                                        />
                                                    ) : (
                                                        <ColorPicker
                                                            color={color.light}
                                                            onChange={(value) =>
                                                                handleColorChange(globalIndex, {
                                                                    ...color,
                                                                    light: value,
                                                                })
                                                            }
                                                            disabled={isReadOnly}
                                                        />
                                                    )}
                                                </td>
                                                <td className="p-2">
                                                    {isReadOnly ? (
                                                        <div
                                                            className="w-full h-8 rounded border border-gray-300 dark:border-gray-600"
                                                            style={{ backgroundColor: color.dark }}
                                                        />
                                                    ) : (
                                                        <ColorPicker
                                                            color={color.dark}
                                                            onChange={(value) =>
                                                                handleColorChange(globalIndex, {
                                                                    ...color,
                                                                    dark: value,
                                                                })
                                                            }
                                                            disabled={isReadOnly}
                                                        />
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddTheme}>
                    Ajouter un thème
                </AdminButton>
            )}
        </SectionCard>
    );
}
