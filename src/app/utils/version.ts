import { readFileSync } from 'fs';
import { join } from 'path';

let cachedPkg: Record<string, unknown> | null | undefined;

function readPackageJson(): Record<string, unknown> | null {
    if (cachedPkg !== undefined) return cachedPkg;
    try {
        cachedPkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    } catch {
        cachedPkg = null;
    }
    return cachedPkg!;
}

export function getSoftwareVersion(): string | null {
    return (readPackageJson()?.version as string) || null;
}

export function getSoftwareName(): string | null {
    return (readPackageJson()?.name as string) || null;
}
