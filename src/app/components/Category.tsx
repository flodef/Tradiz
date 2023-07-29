'use client';

import { FC, MouseEventHandler, useCallback, useEffect, useMemo, useState } from 'react';
import { State, useConfig } from '../hooks/useConfig';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { CATEGORY_SEPARATOR, OTHER_KEYWORD } from '../utils/constants';
import { requestFullscreen } from '../utils/fullscreen';
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
            requestFullscreen();

            onInput(input, e.type);
        },
        [input, onInput]
    );

    const category = selectedCategory.split(CATEGORY_SEPARATOR);

    return (
        <div
            className={
                'w-1/3 relative flex justify-center py-3 items-center font-semibold text-2xl truncate ' +
                'active:bg-active-light active:dark:bg-active-dark ' +
                ((input !== OTHER_KEYWORD ? category.includes(input) : input === category.at(0))
                    ? ' bg-active-light dark:bg-active-dark'
                    : '')
            }
            onClick={onClick}
            onContextMenu={onClick}
        >
            {input.slice(0, 10)}
        </div>
    );
};

export const Category: FC = () => {
    const { inventory, state, lastModified, setState } = useConfig();
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
                addCategory(item.category.concat(CATEGORY_SEPARATOR, OTHER_KEYWORD));
            } else {
                openPopup(
                    item.category,
                    item.products.map(({ label }) => label).concat(OTHER_KEYWORD),
                    (index, option) => {
                        if (index < 0) return;

                        setSelectedProduct(option);
                        const newCategory = item.category.concat(CATEGORY_SEPARATOR, option);
                        if (amount) {
                            addCategory(newCategory);
                        }
                        if (!amount || selectedCategory) {
                            const price = item.products.at(index)?.price;
                            if (option !== OTHER_KEYWORD && price) {
                                setAmount(price);
                                setQuantity(-1); // Set the multiplier to 1 (ready for the next input)
                            }
                            setSelectedCategory(newCategory);
                        }
                    }
                );
            }
        },
        [openPopup, amount, setAmount, addCategory, setSelectedCategory, selectedCategory, setQuantity, inventory]
    );

    const categories = useMemo(
        () =>
            inventory.map(({ category }) =>
                category !== selectedCategory.split(CATEGORY_SEPARATOR).at(0) || selectedProduct === OTHER_KEYWORD
                    ? category
                    : selectedProduct
            ),
        [selectedCategory, selectedProduct, inventory]
    );

    useEffect(() => {
        switch (state) {
            case State.error:
                openPopup(
                    'Erreur chargement données',
                    [`Utiliser sauvegarde du ${lastModified}`, 'Réessayer'],
                    (index) => {
                        setState(index === 1 ? State.init : State.done);
                    }
                );
                break;
            case State.fatal:
                openPopup('Erreur fatale', ['Rafraîchir la page'], () => setState(State.init));
        }
    }, [state, openPopup, setSelectedCategory, lastModified, setState]);

    const rowClassName = 'flex justify-evenly divide-x divide-active-light dark:divide-active-dark';

    return (
        <div
            className={useAddPopupClass(
                'inset-x-0 divide-y border-t-[3px] md:absolute md:bottom-0 md:w-1/2 ' +
                    'divide-active-light border-active-light dark:divide-active-dark dark:border-active-dark'
            )}
        >
            {(state === State.init || state === State.loading) && (
                <div className="min-h-[113px] flex justify-center items-center font-semibold text-2xl">
                    Chargement...
                </div>
            )}
            {state === State.done && categories.length > 0 && (
                <div className={rowClassName}>
                    {categories.slice(0, 3).map((category, index) => (
                        <CategoryButton key={index} input={category} onInput={onInput} />
                    ))}
                </div>
            )}
            {state === State.done && categories.length > 3 && (
                <div className={rowClassName}>
                    {categories.slice(3, 6).map((category, index) => (
                        <CategoryButton
                            key={index}
                            input={category === categories[5] && categories.length > 6 ? OTHER_KEYWORD : category}
                            onInput={onInput}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
