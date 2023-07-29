import { useEffect, useState } from 'react';

export enum ColorScheme {
    Light = 'light',
    Dark = 'dark',
}

export function useWindowParam() {
    // Initialize state with undefined width/height so server and client renders match
    // Learn more here: https://joshwcomeau.com/react/the-perils-of-rehydration/
    const [windowSize, setWindowSize] = useState({
        width: -1,
        height: -1,
    });
    const [colorScheme, setColorScheme] = useState(ColorScheme.Light);

    useEffect(() => {
        // only execute all the code below in client side
        // Handler to call on window resize
        const handleResize = () => {
            // Set window width/height to state
            setWindowSize({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };
        const handleColorScheme = (event: MediaQueryListEvent) => {
            setColorScheme(event.matches ? ColorScheme.Dark : ColorScheme.Light);
        };

        // Add event listener
        window.addEventListener('resize', handleResize);
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handleColorScheme);

        // Call handler right away so state gets updated with initial window size
        handleResize();
        setColorScheme(
            window.matchMedia('(prefers-color-scheme: dark)').matches ? ColorScheme.Dark : ColorScheme.Light
        );

        // Remove event listener on cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', handleColorScheme);
        };
    }, []); // Empty array ensures that effect is only run on mount
    return { width: windowSize.width, height: windowSize.height, colorScheme };
}
