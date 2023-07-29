import { FC } from 'react';

interface LoadingTextProps {
    text: string;
    fullscreen?: boolean;
}

// inspired by https://codepen.io/42EG4M1/pen/bVMzze/
export const LoadingText: FC<LoadingTextProps> = ({ text, fullscreen = true }) => {
    const phrase = text
        .toUpperCase()
        .split('')
        .filter((_, i) => i < 10);
    const rootClassName = 'inline-block my-0 mx-1 blur-0 ';
    const animateClassNames = [
        'animate-loading0',
        'animate-loading1',
        'animate-loading2',
        'animate-loading3',
        'animate-loading4',
        'animate-loading5',
        'animate-loading6',
        'animate-loading7',
        'animate-loading8',
        'animate-loading9',
    ];

    return (
        <div
            className={
                'text-center w-full h-full flex items-center justify-center font-semibold text-2xl ' +
                (fullscreen ? 'absolute inset-0' : '')
            }
            style={{ background: 'inherit' }}
        >
            {phrase.map((item, i) => (
                <span key={i} className={rootClassName + animateClassNames[i]}>
                    {item}
                </span>
            ))}
        </div>
    );
};

interface LoadingDotProps {
    fullscreen?: boolean;
}

// inspired by https://codepen.io/sudeepgumaste/pen/abdrorB
export const LoadingDot: FC<LoadingDotProps> = ({ fullscreen = true }) => {
    const circleClassName = ' h-4 w-4 rounded-full bg-writing-light dark:bg-writing-dark ';
    return (
        <div
            className={
                'text-center w-full h-full flex items-center justify-center ' + (fullscreen ? 'absolute inset-0' : '')
            }
            style={{ background: 'inherit' }}
        >
            <div className={'h-4 w-28 flex relative '}>
                <span className={circleClassName + 'absolute top-0 left-0 mr-8 animate-grow'}></span>
                <span className={circleClassName + 'mr-[30px] animate-move'}></span>
                <span className={circleClassName + 'mr-[30px] animate-move'}></span>
                <span className={circleClassName + 'absolute top-0 right-0 mr-0 animate-growReverse'}></span>
            </div>
        </div>
    );
};

interface LoadingSpinnerProps {
    fullscreen?: boolean;
}

// inspired by https://codepen.io/jkantner/pen/mdKOpbe
export const LoadingSpinner: FC<LoadingSpinnerProps> = ({ fullscreen = true }) => {
    //TODO: add a spinner
    return null;
};

export enum LoadingType {
    Text,
    Dot,
    Spinner,
}

export default function Loading(type = LoadingType.Dot, fullscreen = true) {
    // You can add any UI inside Loading, including a Skeleton.
    switch (type) {
        case LoadingType.Text:
            return <LoadingText text="Chargement" fullscreen={fullscreen} />;
        case LoadingType.Dot:
            return <LoadingDot fullscreen={fullscreen} />;
        case LoadingType.Spinner:
            return <LoadingSpinner fullscreen={fullscreen} />;
        default:
            return <LoadingDot fullscreen={fullscreen} />;
    }
}
