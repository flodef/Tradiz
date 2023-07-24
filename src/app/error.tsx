'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import { Open_Sans } from 'next/font/google';
import Link from 'next/link';

const openSans = Open_Sans({ subsets: ['latin'], weight: ['400', '700'] });

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
    }, [error]);

    const retry = () => setTimeout(reset, 1000); // Attempt to recover by trying to re-render the segment

    return (
        <div className={openSans.className}>
            <style jsx>
                {`
                    .internal:hover .zero:before {
                        animation: cross1Reverse 300ms;
                    }
                    .internal:hover .zero:after {
                        animation: cross2Reverse 300ms;
                    }

                    .zero:before,
                    .zero:after {
                        position: absolute;
                        display: block;
                        content: '';
                        width: 140%;
                        height: 10vmin;
                        background: #bef264;
                        background-image: linear-gradient(90deg, #bef264, #84cc16);
                        left: -20%;
                        top: 45%;
                        box-shadow: 0 1vmin 5vmin rgba(0, 0, 0, 0.5);
                    }
                    .zero:before {
                        transform: rotate(45deg) scaleX(0) scaleY(0.7);
                        animation: cross1 300ms 1s ease-in-out forwards;
                    }
                    .zero:after {
                        transform: rotate(-45deg) scaleX(0) scaleY(0.7);
                        animation: cross2 400ms 1.2s ease-in-out forwards;
                    }
                    .zero:nth-child(2):before {
                        transform: rotate(45deg) scaleX(0) scaleY(0.7);
                        animation: cross1 400ms 1.1s ease-in-out forwards;
                    }
                    .zero:nth-child(2):after {
                        transform: rotate(-45deg) scaleX(0) scaleY(0.7);
                        animation: cross2 500ms 1.3s ease-in-out forwards;
                    }
                `}
            </style>
            <div
                className={
                    'w-screen h-screen overflow-hidden flex flex-col items-center justify-center font-bold ' +
                    'bg-gradient-to-tr from-low-light to-high-light dark:from-low-dark dark:to-high-dark ' +
                    'uppercase text-[3vmin] text-center text-secondary-light dark:text-secondary-dark'
                }
            >
                <p className="px-6">
                    Oups ! Mon appli s'est emmelée les pinceaux ... <br />
                    Merci de me le signaler à{' '}
                    <Link target="_blank" href={`mailto:flo@fims.fi?subject=Erreur innatendue sur ${window.location}`}>
                        flo@fims.fi
                    </Link>
                </p>
                <h1
                    className={
                        'internal text-white text-[50vmin] text-center relative mb-[10vmin] cursor-pointer hover:scale-110 ' +
                        "hover:before:animate-flipReverse before:content-['('] before:absolute before:-rotate-90 " +
                        'before:right-[25vmin] before:bottom-[-30vmin] before:block before:text-[115%] before:animate-flip '
                    }
                    style={{ textShadow: '0 1vmin 5vmin rgba(0, 0, 0, 0.5)', transition: 'transform 300ms' }}
                    onClick={retry}
                >
                    <span className="five">5</span>
                    <span className="zero relative">0</span>
                    <span className="zero relative">0</span>
                </h1>
                <p className="px-6 cursor-pointer" onClick={retry}>
                    Recharger la page
                </p>
            </div>
        </div>
    );
}
