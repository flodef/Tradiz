const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const STANDALONE_DIR = path.join(ROOT, '.next/standalone');

function dereferenceSymlinks(dir, visited) {
    if (!visited) visited = new Set();
    if (visited.has(dir)) return;
    visited.add(dir);

    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (var entry of entries) {
        var entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            dereferenceSymlinks(entryPath, visited);
        } else if (entry.isSymbolicLink()) {
            var target;
            try {
                target = fs.realpathSync(entryPath);
            } catch {
                continue;
            }
            var stat = fs.statSync(target);

            // Replace the symlink with the actual file/directory contents.
            try {
                fs.unlinkSync(entryPath);
            } catch {
                continue;
            }
            if (stat.isDirectory()) {
                fs.cpSync(target, entryPath, { recursive: true, dereference: true });
            } else {
                fs.copyFileSync(target, entryPath);
            }
        }
    }
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn('Source not found: ' + src);
        return;
    }
    fs.cpSync(src, dest, { recursive: true, dereference: true });
    console.log('Copied ' + src + ' -> ' + dest);
}

function main() {
    if (!fs.existsSync(STANDALONE_DIR)) {
        console.warn('Standalone directory not found: ' + STANDALONE_DIR);
        return;
    }

    console.log('Dereferencing symlinks in .next/standalone for packaging...');
    dereferenceSymlinks(STANDALONE_DIR);
    console.log('Done dereferencing.');

    // Next.js standalone requires .next/static and public/ to be copied alongside.
    var staticSrc = path.join(ROOT, '.next/static');
    var staticDest = path.join(STANDALONE_DIR, '.next/static');
    copyDir(staticSrc, staticDest);

    var publicSrc = path.join(ROOT, 'public');
    var publicDest = path.join(STANDALONE_DIR, 'public');
    copyDir(publicSrc, publicDest);

    console.log('Standalone preparation complete.');
}

main();
