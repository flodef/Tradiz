import { Color } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import ColorItem from '../items/ColorItem';
import AdminButton from '../AdminButton';

export default function ColorsConfig({
    config,
    onChange,
    onSave,
    isReadOnly = false,
}: {
    config: Color[];
    onChange: (data: Color[]) => void;
    onSave: (data: Color[]) => void;
    isReadOnly?: boolean;
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

    const handleAddColor = () => {
        const newColor: Color = {
            label: '',
            light: '#FFFFFF',
            dark: '#000000',
        };
        const updated = [...colors, newColor];
        setColors(updated);
        onChange(updated);
    };

    const handleDeleteColor = (index: number) => {
        const newColors = colors.filter((_, i) => i !== index);
        setColors(newColors);
        onChange(newColors);
    };

    return (
        <SectionCard title="Couleurs" onSave={isReadOnly ? undefined : () => onSave(colors)}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {colors.map((color, index) => (
                    <ColorItem
                        key={index}
                        color={color}
                        onChange={(updatedColor) => handleColorChange(index, updatedColor)}
                        onDelete={() => handleDeleteColor(index)}
                        isReadOnly={isReadOnly}
                    />
                ))}
            </div>
            {!isReadOnly && (
                <AdminButton variant="add" onClick={handleAddColor}>
                    Ajouter une couleur
                </AdminButton>
            )}
        </SectionCard>
    );
}
