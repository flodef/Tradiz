const fs = require('fs');
const path = require('path');

const STANDALONE_DIR = path.resolve(__dirname, '../../.next/standalone');

function dereferenceSymlinks(dir, visited = new Set()) {
    if (visited.has(dir)) return;
    visited.add(dir);

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            dereferenceSymlinks(entryPath, visited);
        } else if (entry.isSymbolicLink()) {
            const target = fs.realpathSync(entryPath);
            const stat = fs.statSync(target);

            // Replace the symlink with the actual file/directory contents.
            fs.unlinkSync(entryPath);
            if (stat.isDirectory()) {
                fs.cpSync(target, entryPath, { recursive: true, dereference: true });
            } else {
                fs.copyFileSync(target, entryPath);
            }
        }
    }
}

function main() {
    if (!fs.existsSync(STANDALONE_DIR)) {
        console.warn(`Standalone directory not found: ${STANDALONE_DIR}`);
        return;
    }
    console.log('Dereferencing symlinks in .next/standalone for packaging...');
    dereferenceSymlinks(STANDALONE_DIR);
    console.log('Done.');
}

main();
