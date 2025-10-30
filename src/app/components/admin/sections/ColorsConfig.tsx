import { Color } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import ColorItem from '../items/ColorItem';

export default function ColorsConfig({
    config,
    onChange,
    onSave,
}: {
    config: Color[];
    onChange: (data: Color[]) => void;
    onSave: (data: Color[]) => void;
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
        setColors([...colors, newColor]);
        onChange([...colors, newColor]);
    };

    const handleDeleteColor = (index: number) => {
        const newColors = colors.filter((_, i) => i !== index);
        setColors(newColors);
        onChange(newColors);
    };

    return (
        <SectionCard title="Couleurs" onSave={() => onSave(colors)}>
            {colors.map((color, index) => (
                <ColorItem
                    key={index}
                    color={color}
                    onChange={(updatedColor) => handleColorChange(index, updatedColor)}
                    onDelete={() => handleDeleteColor(index)}
                />
            ))}
            <button
                onClick={handleAddColor}
                className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
                Ajouter une couleur
            </button>
        </SectionCard>
    );
}
