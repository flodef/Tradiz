import { FC, MouseEventHandler, useCallback } from 'react';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { categorySeparator, inventory, otherKeyword } from '../utils/data';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';
import { useAddPopupClass } from './Popup';
import { Separator } from './Separator';

interface CategoryInputButton {
    input: string;
    onInput: (input: string, eventType: string) => void;
}

const CategoryButton: FC<CategoryInputButton> = ({ input, onInput }) => {
    const { category } = useData();

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

    console.log(input, category.split(categorySeparator)[0]);

    return (
        <div
            className={
                'w-1/3 relative flex justify-center py-3 items-center font-semibold text-2xl active:bg-orange-300' +
                (input === category.split(categorySeparator).at(0) ? ' bg-orange-300' : '')
            }
            onClick={onClick}
            onContextMenu={onClick}
        >
            {input}
        </div>
    );
};

export const Category: FC = () => {
    const { addProduct, amount, setAmount, category, setCategory } = useData();
    const { openPopup } = usePopup();

    const addCategory = useCallback(
        (newCategory: string) => {
            if (!category) {
                addProduct(newCategory);
            } else {
                addProduct(category);
                setCategory(newCategory);
            }
        },
        [addProduct, category, setCategory]
    );

    const onInput = useCallback(
        (input: string, eventType: string) => {
            const item = inventory.find((item) => item.category === input);
            if (!item) return;

            if (eventType === 'contextmenu' && amount) {
                addCategory(item.category);
            } else {
                openPopup(
                    item.category,
                    item.products.map((product) => product.label).concat(otherKeyword),
                    (option, index) => {
                        const newCategory = item.category.concat(categorySeparator, option);
                        if (amount) {
                            addCategory(newCategory);
                        }
                        if (!amount || category) {
                            const price = item.products.at(index)?.price;
                            if (option !== otherKeyword && price) setAmount(price);
                            setCategory(newCategory);
                        }
                    }
                );
            }
        },
        [openPopup, amount, setAmount, addCategory, setCategory, category]
    );

    return (
        <div className={useAddPopupClass('inset-x-0 divide-y divide-orange-300')}>
            <Separator />
            {inventory.length > 0 && (
                <div className="flex justify-evenly divide-x divide-orange-300">
                    {inventory.slice(0, 3).map((item, index) => (
                        <CategoryButton key={index} input={item.category} onInput={onInput} />
                    ))}
                </div>
            )}
            {inventory.length > 3 && (
                <div className="flex justify-evenly divide-x divide-orange-300">
                    {inventory.slice(3, 6).map((item, index) => (
                        <CategoryButton
                            key={index}
                            input={
                                item.category === inventory[5].category && inventory.length > 6
                                    ? otherKeyword
                                    : item.category
                            }
                            onInput={onInput}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
