/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
        './src/components/**/*.{js,ts,jsx,tsx,mdx}',
        './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            animation: {
                blink: 'blink 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                strokeCircle: 'stroke .6s cubic-bezier(0.65, 0, 0.45, 1) forwards',
                strokeCheck: 'stroke .3s cubic-bezier(0.65, 0, 0.45, 1) .8s forwards',
                fillGreen: 'fillGreen .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both',
                fillRed: 'fillRed .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both',
                swing: 'swing 1.3s ease-in-out infinite alternate',
                swinghair: 'swinghair 1.3s ease-in-out infinite alternate',
                flip: 'flip 1000ms 1.6s ease-in-out forwards',
                cross1: 'cross1 300ms 1s ease-in-out forwards',
                cross2: 'cross2 400ms 1.2s ease-in-out forwards',
                flipReverse: 'flipReverse 300ms',
                cross1Reverse: 'cross1Reverse 300ms',
                cross2Reverse: 'cross2Reverse 300ms',
            },
            keyframes: {
                blink: {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0 },
                },
                stroke: {
                    '100%': { strokeDashoffset: 0 },
                },
                scale: {
                    '0%, 100%': { transform: 'none' },
                    '50%': { transform: 'scale3d(1.1, 1.1, 1)' },
                },
                fillGreen: {
                    '100%': { boxShadow: 'inset 0px 0px 0px 180px #84cc16' },
                },
                fillRed: {
                    '100%': { boxShadow: 'inset 0px 0px 0px 180px #ef4444' },
                },
                swing: {
                    '0%': { transform: 'rotate(10deg)' },
                    '100%': { transform: 'rotate(-10deg)' },
                },
                swinghair: {
                    '0%': { transform: 'rotate(6deg)' },
                    '100%': { transform: 'rotate(-6deg)' },
                },
                cross1: {
                    '0%': {
                        transform: 'rotate(45deg) scaleX(0) scaleY(0.7)',
                        boxShadow: '0 1vmin 5vmin rgba(0, 0, 0, 0)',
                    },
                    '100%': {
                        transform: 'rotate(45deg) scaleX(1) scaleY(1)',
                        boxShadow: '0 1vmin 5vmin rgba(0, 0, 0, 0.5)',
                    },
                },
                cross2: {
                    '0%': {
                        transform: 'rotate(-45deg) scaleX(0) scaleY(0.7)',
                        boxShadow: '0 1vmin 5vmin rgba(0, 0, 0, 0)',
                    },
                    '100%': {
                        transform: 'rotate(-45deg) scaleX(1) scaleY(1)',
                        boxShadow: '0 1vmin 5vmin rgba(0, 0, 0, 0.5)',
                    },
                },
                cross1Reverse: {
                    '100%': {
                        transform: 'rotate(45deg) scaleX(0) scaleY(0.7)',
                        boxShadow: '0 1vmin 5vmin rgba(0, 0, 0, 0)',
                        opacity: 0,
                    },
                    '0%': {
                        transform: 'rotate(45deg) scaleX(1) scaleY(1)',
                        boxShadow: '0 1vmin 5vmin rgba(0, 0, 0, 0.5)',
                        opacity: 1,
                    },
                },
                cross2Reverse: {
                    '100%': {
                        transform: 'rotate(-45deg) scaleX(0) scaleY(0.7)',
                        boxShadow: '0 1vmin 5vmin rgba(0, 0, 0, 0)',
                        opacity: 0,
                    },
                    '0%': {
                        transform: 'rotate(-45deg) scaleX(1) scaleY(1)',
                        boxShadow: '0 1vmin 5vmin rgba(0, 0, 0, 0.5)',
                        opacity: 1,
                    },
                },
                flip: {
                    '0%': {
                        transform: 'rotate(-90deg) rotateY(0deg) translateX(0)',
                    },
                    '60%': {
                        transform: 'rotate(-90deg) rotateY(200deg) translateX(3vmin)',
                    },
                    '80%': {
                        transform: 'rotate(-90deg) rotateY(170deg) translateX(3vmin)',
                    },
                    '100%': {
                        transform: 'rotate(-90deg) rotateY(180deg) translateX(3vmin)',
                    },
                },
                flipReverse: {
                    '100%': {
                        transform: 'rotate(-90deg) rotateY(0deg) translateX(0)',
                    },
                    '40%': {
                        transform: 'rotate(-90deg) rotateY(200deg) translateX(3vmin)',
                    },
                    '20%': {
                        transform: 'rotate(-90deg) rotateY(170deg) translateX(3vmin)',
                    },
                    '0%': {
                        transform: 'rotate(-90deg) rotateY(180deg) translateX(3vmin)',
                    },
                },
            },
            colors: {
                'writing-light': '#d97906', // amber-600
                'low-light': '#fff7ed', // orange-50
                'high-light': '#fed7aa', // orange-200
                'bg-light': '#f9b384',
                'active-light': '#fdba74', // orange-300
                'secondary-light': '#84cc16', // lime-500
                'secondary-active-light': '#bef264', // lime-300
                'writing-dark': '#d97906',
                'low-dark': '#fff7ed',
                'high-dark': '#fed7aa',
                'bg-dark': '#f9b384',
                'active-dark': '#fdba74',
                'secondary-dark': '#84cc16',
                'secondary-active-dark': '#bef264',
                ok: '#84cc16', // lime-500
                error: '#ef4444', // red-500
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
            },
        },
    },
    plugins: [],
};
