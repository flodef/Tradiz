import { FC, useCallback } from 'react';
import { useData } from '../hooks/useData';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';
import { addPopupClass } from './Popup';
import { Separator } from './Separator';

interface CategoryList {
    category: string[][];
}

interface CategoryInputButton {
    input: string;
}

const CategoryButton: FC<CategoryInputButton> = ({ input }) => {
    const { addProduct, currentAmount } = useData();

    const onClick = useCallback(() => {
        if (!isFullscreen() && isMobileDevice()) {
            requestFullscreen();
        }
        addProduct(input, currentAmount.current);
    }, [input]);

    let s = 'w-1/3 relative flex justify-center py-3 items-center font-semibold text-2xl ';
    s += currentAmount.current ? 'active:bg-orange-300' : 'text-gray-300';

    return (
        <div className={s} onClick={onClick}>
            {input}
        </div>
    );
};

export const Category: FC<CategoryList> = ({ category }) => {
    return (
        <div className={addPopupClass('absolute inset-x-0 bottom-0 divide-y divide-orange-300')}>
            <Separator />
            {category.map((category, index) => (
                <div className="flex justify-evenly divide-x divide-orange-300" key={index}>
                    {category.map((category) => (
                        <CategoryButton input={category} key={category} />
                    ))}
                </div>
            ))}
        </div>
    );
};
