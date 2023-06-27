import { FC, useCallback } from 'react';
import { useData } from '../hooks/useData';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { isMobileDevice } from '../utils/mobile';

interface CategoryList {
    category: string[][];
}

interface CategoryInputButton {
    input: string;
}

const CategoryButton: FC<CategoryInputButton> = ({ input }) => {
    const { addTransaction, amount } = useData();

    const onClick = useCallback(() => {
        if (!isFullscreen() && isMobileDevice()) {
            requestFullscreen();
        }
        addTransaction(input, amount.current);
    }, [input]);
    return (
        <div
            className="active:bg-orange-300 w-1/3 relative flex justify-center py-3 items-center font-semibold text-2xl"
            onClick={onClick}
        >
            {input}
        </div>
    );
};

export const Category: FC<CategoryList> = ({ category }) => {
    return (
        <div className="absolute inset-x-0 bottom-0 divide-y divide-orange-300">
            <hr className="border-orange-300" />
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
