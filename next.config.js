/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    allowedDevOrigins: ['http://localhost:3001', 'http://127.0.0.1:3001', 'http://yankee-grill.digi-carte.fr:3001'],
};

module.exports = nextConfig;
