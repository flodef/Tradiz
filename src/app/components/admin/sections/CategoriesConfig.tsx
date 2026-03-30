import { Category } from '@/app/utils/interfaces';
import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import CategoryItem from '../items/CategoryItem';

export default function CategoriesConfig({
    config,
    onChange,
    onSave,
    isReadOnly = false,
}: {
    config: Category[];
    onChange: (data: Category[]) => void;
    onSave?: (data: Category[]) => void;
    isReadOnly?: boolean;
}) {
    const [categories, setCategories] = useState(config || []);

    useEffect(() => {
        setCategories(config || []);
    }, [config]);

    const handleCategoryChange = (index: number, updatedCategory: Category) => {
        const newCategories = [...categories];
        newCategories[index] = updatedCategory;
        setCategories(newCategories);
        onChange(newCategories);
    };

    const handleAddCategory = () => {
        const newCategory: Category = {
            label: '',
            vat: 20,
        };
        setCategories([...categories, newCategory]);
        onChange([...categories, newCategory]);
    };

    const handleDeleteCategory = (index: number) => {
        const newCategories = categories.filter((_, i) => i !== index);
        setCategories(newCategories);
        onChange(newCategories);
    };

    return (
        <SectionCard title="Catégories" onSave={onSave ? () => onSave(categories) : undefined}>
            {categories.map((category, index) => (
                <CategoryItem
                    key={index}
                    category={category}
                    onChange={(updatedCategory) => handleCategoryChange(index, updatedCategory)}
                    onDelete={isReadOnly ? undefined : () => handleDeleteCategory(index)}
                />
            ))}
            {!isReadOnly && (
                <button
                    onClick={handleAddCategory}
                    className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-sm"
                >
                    Ajouter une catégorie
                </button>
            )}
        </SectionCard>
    );
}
