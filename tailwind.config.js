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
                    '100%': { boxShadow: 'inset 0px 0px 0px 150px #84cc16' },
                },
                fillRed: {
                    '100%': { boxShadow: 'inset 0px 0px 0px 150px #ef4444' },
                },
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
            },
        },
    },
    plugins: [],
};
