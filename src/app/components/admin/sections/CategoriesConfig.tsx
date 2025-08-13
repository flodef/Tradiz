import { Category } from '@/app/hooks/useConfig';
import SectionCard from '../SectionCard';
import CategoryItem from '../items/CategoryItem';
import { useState, useEffect } from 'react';

export default function CategoriesConfig({
    config,
    onChange,
    onSave,
}: {
    config: Category[];
    onChange: (data: Category[]) => void;
    onSave: (data: Category[]) => void;
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
        <SectionCard title="Catégories" onSave={() => onSave(categories)}>
            {categories.map((category, index) => (
                <CategoryItem
                    key={index}
                    category={category}
                    onChange={(updatedCategory) => handleCategoryChange(index, updatedCategory)}
                    onDelete={() => handleDeleteCategory(index)}
                />
            ))}
            <button
                onClick={handleAddCategory}
                className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
                Ajouter une catégorie
            </button>
        </SectionCard>
    );
}
