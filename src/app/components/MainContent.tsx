'use client';

import { FC } from 'react';
import { useConfig } from '../hooks/useConfig';
import { IS_LOCAL } from '../utils/constants';
import { isFullscreen, requestFullscreen } from '../utils/fullscreen';
import { Category } from './Category';
import { NumPad } from './NumPad';
import { Total } from './Total';

export const MainContent: FC = () => {
    const { isStateReady } = useConfig();

    // Function to handle clicks anywhere on the component to request fullscreen
    const handleClick = () => {
        if (isStateReady && !isFullscreen() && !IS_LOCAL) requestFullscreen();
    };

    return (
        <div className="z-10 flex flex-col justify-between" onClick={handleClick}>
            <Total />
            <NumPad />
            <Category />
        </div>
    );
};
