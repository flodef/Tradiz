import { useEffect, useState } from 'react';
import SectionCard from '../SectionCard';
import ProductItem from '../items/ProductItem';

export interface AdminProduct {
    name: string;
    category: string;
    availability: boolean;
    currencies: string[];
}

export default function ProductsConfig({
    config,
    onChange,
    onSave,
    categories,
    currencies,
}: {
    config: AdminProduct[];
    onChange: (data: AdminProduct[]) => void;
    onSave: (data: AdminProduct[]) => void;
    categories: { label: string; value: string }[];
    currencies: { label: string; value: string }[];
}) {
    const [products, setProducts] = useState(config || []);

    useEffect(() => {
        setProducts(config || []);
    }, [config]);

    const handleProductChange = (index: number, updatedProduct: AdminProduct) => {
        const newProducts = [...products];
        newProducts[index] = updatedProduct;
        setProducts(newProducts);
        onChange(newProducts);
    };

    const handleAddProduct = () => {
        const newProduct: AdminProduct = {
            name: '',
            category: '',
            availability: false,
            currencies: [],
        };
        setProducts([...products, newProduct]);
        onChange([...products, newProduct]);
    };

    const handleDeleteProduct = (index: number) => {
        const newProducts = products.filter((_, i) => i !== index);
        setProducts(newProducts);
        onChange(newProducts);
    };

    return (
        <SectionCard title="Produits" onSave={() => onSave(products)}>
            {products.map((product, index) => (
                <ProductItem
                    key={index}
                    product={product}
                    onChange={(updatedProduct) => handleProductChange(index, updatedProduct)}
                    onDelete={() => handleDeleteProduct(index)}
                    categories={categories}
                    currencies={currencies}
                />
            ))}
            <button
                onClick={handleAddProduct}
                className="mt-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
                Ajouter un produit
            </button>
        </SectionCard>
    );
}
