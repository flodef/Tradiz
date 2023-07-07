import { FC, MouseEventHandler, useCallback, useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { categorySeparator, inventory, otherKeyword } from '../utils/data';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';
import { useAddPopupClass } from './Popup';

interface CategoryInputButton {
    input: string;
    onInput: (input: string, eventType: string) => void;
}

const CategoryButton: FC<CategoryInputButton> = ({ input, onInput }) => {
    const { selectedCategory } = useData();

    const onClick = useCallback<MouseEventHandler>(
        (e) => {
            e.preventDefault();
            if (!isFullscreen() && isMobileDevice()) {
                requestFullscreen();
            }

            onInput(input, e.type);
        },
        [input, onInput]
    );

    const category = selectedCategory.split(categorySeparator);

    return (
        <div
            className={
                'w-1/3 relative flex justify-center py-3 items-center font-semibold text-2xl active:bg-orange-300 truncate' +
                ((input !== otherKeyword ? category.includes(input) : input === category.at(0)) ? ' bg-orange-300' : '')
            }
            onClick={onClick}
            onContextMenu={onClick}
        >
            {input.slice(0, 10)}
        </div>
    );
};

export const Category: FC = () => {
    const { addProduct, amount, setAmount, selectedCategory, setSelectedCategory, setQuantity } = useData();
    const { openPopup } = usePopup();

    const [selectedProduct, setSelectedProduct] = useState('');

    const addCategory = useCallback(
        (newCategory: string) => {
            if (!selectedCategory) {
                addProduct(newCategory);
            } else {
                addProduct(selectedCategory);
                setSelectedCategory(newCategory);
            }
        },
        [addProduct, selectedCategory, setSelectedCategory]
    );

    const onInput = useCallback(
        (input: string, eventType: string) => {
            const item =
                inventory.find(({ category }) => category === input) ??
                inventory.find(({ products }) => products.some(({ label }) => label === input));
            if (!item) return;

            if (eventType === 'contextmenu' && amount) {
                addCategory(item.category.concat(categorySeparator, otherKeyword));
            } else {
                openPopup(
                    item.category,
                    item.products.map(({ label }) => label).concat(otherKeyword),
                    (index, option) => {
                        setSelectedProduct(option);
                        const newCategory = item.category.concat(categorySeparator, option);
                        if (amount) {
                            addCategory(newCategory);
                        }
                        if (!amount || selectedCategory) {
                            const price = item.products.at(index)?.price;
                            if (option !== otherKeyword && price) {
                                setAmount(price);
                                setQuantity(-1); // Set the multiplier to 1 (ready for the next input)
                            }
                            setSelectedCategory(newCategory);
                        }
                    }
                );
            }
        },
        [openPopup, amount, setAmount, addCategory, setSelectedCategory, selectedCategory, setQuantity]
    );

    const categories = useMemo(
        () =>
            inventory.map(({ category }) =>
                category !== selectedCategory.split(categorySeparator).at(0) || selectedProduct === otherKeyword
                    ? category
                    : selectedProduct
            ),
        [selectedCategory, selectedProduct]
    );

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 divide-y divide-orange-300 border-t-[3px] border-orange-300 md:absolute md:bottom-0 md:w-1/2'
            )}
        >
            {categories.length > 0 && (
                <div className="flex justify-evenly divide-x divide-orange-300">
                    {categories.slice(0, 3).map((category, index) => (
                        <CategoryButton key={index} input={category} onInput={onInput} />
                    ))}
                </div>
            )}
            {categories.length > 3 && (
                <div className="flex justify-evenly divide-x divide-orange-300">
                    {categories.slice(3, 6).map((category, index) => (
                        <CategoryButton
                            key={index}
                            input={category === categories[5] && categories.length > 6 ? otherKeyword : category}
                            onInput={onInput}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
