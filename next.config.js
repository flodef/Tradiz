/** @type {import('next').NextConfig} */
const { readFileSync } = require('fs');
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

const nextConfig = {
    output: 'standalone',
    allowedDevOrigins: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    turbopack: {
        root: process.cwd(),
    },
    env: {
        NEXT_PUBLIC_APP_VERSION: packageJson.version,
    },
};

module.exports = nextConfig;
