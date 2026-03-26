import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Tradiz - Caisse Enregistreuse',
        short_name: 'Tradiz',
        description: 'Caisse Enregistreuse pour les commercants permettant de gerer les ventes et les stocks',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#3367D6',
        icons: [
            {
                src: '/icons/favicon.ico',
                sizes: '32x32',
                type: 'image/x-icon',
            },
            {
                src: '/icons/icons-192.png',
                type: 'image/png',
                sizes: '192x192',
            },
            {
                src: '/icons/icons-512.png',
                type: 'image/png',
                sizes: '512x512',
            },
        ],
    };
}
