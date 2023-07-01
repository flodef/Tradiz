import { FC, useCallback } from 'react';
import { useData } from '../hooks/useData';
import { usePopup } from '../hooks/usePopup';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';
import { useAddPopupClass } from './Popup';
import { Separator } from './Separator';

interface Categories {
    categories: string[];
    otherKeyword: string;
}

interface CategoryInputButton {
    input: string;
    onInput: (input: string) => void;
}

const CategoryButton: FC<CategoryInputButton> = ({ input, onInput }) => {
    const { amount } = useData();

    const onClick = useCallback(() => {
        if (!isFullscreen() && isMobileDevice()) {
            requestFullscreen();
        }
        if (amount) {
            onInput(input);
        }
    }, [input, onInput, amount]);

    let s = 'w-1/3 relative flex justify-center py-3 items-center font-semibold text-2xl ';
    s += amount ? 'active:bg-orange-300' : 'text-gray-300';

    return (
        <div className={s} onClick={onClick}>
            {input}
        </div>
    );
};

export const Category: FC<Categories> = ({ categories, otherKeyword }) => {
    const { addProduct, amount } = useData();
    const { openPopup } = usePopup();

    const onInput = useCallback(
        (input: string) => {
            if (input !== otherKeyword) {
                addProduct(input);
            } else {
                openPopup('Catégorie', categories.slice(5), addProduct);
            }
        },
        [categories, otherKeyword, addProduct, openPopup]
    );

    return (
        <div className={useAddPopupClass('inset-x-0 divide-y divide-orange-300' + (amount ? '' : ' invisible'))}>
            <Separator />
            {categories.length > 0 && (
                <div className="flex justify-evenly divide-x divide-orange-300">
                    {categories.slice(0, 3).map((category) => (
                        <CategoryButton key={category} input={category} onInput={onInput} />
                    ))}
                </div>
            )}
            {categories.length > 3 && (
                <div className="flex justify-evenly divide-x divide-orange-300">
                    {categories.slice(3, 6).map((category) => (
                        <CategoryButton
                            key={category}
                            input={category === categories[5] && categories.length > 6 ? otherKeyword : category}
                            onInput={onInput}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
