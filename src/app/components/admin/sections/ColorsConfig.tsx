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
    selectedThemeIndex: externalSelectedIndex,
    onThemeSelect,
    customThemeNames: externalCustomNames,
    onCustomThemeNamesChange,
}: {
    config: Color[];
    onChange: (data: Color[]) => void;
    onSave?: (data: Color[]) => void;
    isReadOnly?: boolean;
    themeName?: string;
    onThemeNameChange?: (name: string) => void;
    onCancel?: () => void;
    isLoading?: boolean;
    selectedThemeIndex?: number;
    onThemeSelect?: (index: number) => void;
    customThemeNames?: Record<number, string>;
    onCustomThemeNamesChange?: (names: Record<number, string>) => void;
}) {
    const [colors, setColors] = useState(config || []);
    const [internalSelectedIndex, setInternalSelectedIndex] = useState(0);
    const [internalCustomNames, setInternalCustomNames] = useState<Record<number, string>>({});

    // Use external state if provided, otherwise internal
    const selectedThemeIndex = externalSelectedIndex !== undefined ? externalSelectedIndex : internalSelectedIndex;
    const customThemeNames = externalCustomNames !== undefined ? externalCustomNames : internalCustomNames;

    useEffect(() => {
        setColors(config || []);
    }, [config]);

    // Notify parent of selection change to trigger save/cancel buttons
    const handleThemeSelect = (index: number) => {
        if (onThemeSelect) {
            onThemeSelect(index);
        } else {
            setInternalSelectedIndex(index);
        }
        // Create a new colors array reference to trigger change detection in parent
        const newColors = [...colors];
        setColors(newColors);
        onChange(newColors);
    };

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

    // Generate theme names for all themes
    const getThemeName = (index: number) => {
        if (index === 0) return themeName || 'Défaut';
        return customThemeNames[index] || `Thème ${index + 1}`;
    };

    const handleThemeNameChange = (index: number, value: string) => {
        if (index === 0) {
            onThemeNameChange?.(value);
        } else {
            // Update custom theme names
            const newNames = { ...customThemeNames, [index]: value };
            if (onCustomThemeNamesChange) {
                onCustomThemeNamesChange(newNames);
            } else {
                setInternalCustomNames(newNames);
            }
        }
        // Always trigger change detection
        const newColors = [...colors];
        setColors(newColors);
        onChange(newColors);
    };

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
                        onClick={() => handleThemeSelect(themeIndex)}
                        className={`border rounded-lg p-4 relative min-w-0 cursor-pointer transition-all ${
                            selectedThemeIndex === themeIndex
                                ? 'border-3 border-blue-500 dark:border-blue-400 shadow-md'
                                : 'border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <div className="flex-1">
                                {!isReadOnly ? (
                                    <ValidatedInput
                                        label="Thème"
                                        type="text"
                                        value={getThemeName(themeIndex)}
                                        onChange={(value) => handleThemeNameChange(themeIndex, String(value))}
                                        maxLength={30}
                                        className="min-w-48 w-48"
                                    />
                                ) : (
                                    <h3 className={adminBaseStyle}>Thème: {getThemeName(themeIndex)}</h3>
                                )}
                            </div>
                            {!isReadOnly && themes.length > 1 && (
                                <div onClick={(e) => e.stopPropagation()} className="mb-auto">
                                    <DeleteButton
                                        onClick={() => {
                                            // Remove this theme (7 colors)
                                            const startIdx = themeIndex * 7;
                                            const newColors = colors.filter(
                                                (_, i) => i < startIdx || i >= startIdx + 7
                                            );
                                            setColors(newColors);
                                            onChange(newColors);
                                            // Clean up custom theme name for deleted theme and reindex
                                            const newNames: Record<number, string> = {};
                                            for (let i = 1; i < themes.length; i++) {
                                                if (i < themeIndex) {
                                                    newNames[i] = customThemeNames[i] || `Thème ${i + 1}`;
                                                } else if (i > themeIndex) {
                                                    newNames[i - 1] = customThemeNames[i] || `Thème ${i + 1}`;
                                                }
                                                // i === themeIndex is skipped (deleted)
                                            }
                                            if (onCustomThemeNamesChange) {
                                                onCustomThemeNamesChange(newNames);
                                            } else {
                                                setInternalCustomNames(newNames);
                                            }
                                            // Adjust selected index if needed
                                            let newSelectedIndex = selectedThemeIndex;
                                            if (selectedThemeIndex >= themes.length - 1) {
                                                newSelectedIndex = Math.max(0, themes.length - 2);
                                            } else if (selectedThemeIndex === themeIndex) {
                                                // If deleted the selected theme, select the previous one
                                                newSelectedIndex = Math.max(0, themeIndex - 1);
                                            } else if (selectedThemeIndex > themeIndex) {
                                                // If selected theme was after deleted one, adjust index
                                                newSelectedIndex = selectedThemeIndex - 1;
                                            }
                                            if (onThemeSelect) {
                                                onThemeSelect(newSelectedIndex);
                                            } else {
                                                setInternalSelectedIndex(newSelectedIndex);
                                            }
                                        }}
                                        title="Supprimer le thème"
                                    />
                                </div>
                            )}
                        </div>
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
