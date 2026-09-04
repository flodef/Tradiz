import { readFileSync } from 'fs';
import { join } from 'path';

function readPackageJson(): Record<string, unknown> | null {
    try {
        return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    } catch {
        return null;
    }
}

export function getSoftwareVersion(): string | null {
    return (readPackageJson()?.version as string) || null;
}

export function getSoftwareName(): string | null {
    return (readPackageJson()?.name as string) || null;
}
