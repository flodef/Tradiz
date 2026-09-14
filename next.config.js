/** @type {import('next').NextConfig} */
const { readFileSync, existsSync, rmSync } = require('fs');
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Clean previous build outputs so the type checker and file tracer don't scan old artifacts.
// electron/standalone-build must be removed too: if left in place, Next.js traces it into
// .next/standalone, and prepare-standalone.js then copies that nested copy back in, so each
// build adds another nested layer (installer bloat + broken ESLint tsconfig resolution).
for (const dir of ['./dist', './electron/standalone-build']) {
    if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
    }
}

const nextConfig = {
    output: process.env.VERCEL ? undefined : 'standalone',
    // The resetDemo route reads these files at runtime via process.cwd() —
    // force-trace them into the standalone bundle or the route 500s there.
    outputFileTracingIncludes: {
        '/api/sql/resetDemo': ['./scripts/reset-demo.sql', './scripts/seed-demo-data.sql'],
    },
    allowedDevOrigins: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    turbopack: {
        root: process.cwd(),
    },
    env: {
        NEXT_PUBLIC_APP_VERSION: packageJson.version,
    },
};

module.exports = nextConfig;
