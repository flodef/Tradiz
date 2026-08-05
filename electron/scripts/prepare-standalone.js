const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const STANDALONE_SRC = path.join(ROOT, '.next/standalone');
const STANDALONE_BUILD = path.join(ROOT, 'electron/standalone-build');

function copyDirDereferenced(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn('Source not found: ' + src);
        return;
    }
    // cpSync with dereference:true resolves all symlinks to real files.
    fs.cpSync(src, dest, { recursive: true, dereference: true });
    console.log('Copied ' + src + ' -> ' + dest);
}

function main() {
    if (!fs.existsSync(STANDALONE_SRC)) {
        console.warn('Standalone directory not found: ' + STANDALONE_SRC);
        return;
    }

    // Clean previous build copy.
    if (fs.existsSync(STANDALONE_BUILD)) {
        fs.rmSync(STANDALONE_BUILD, { recursive: true, force: true });
    }

    // Copy the entire standalone directory with all symlinks dereferenced.
    // This ensures node_modules/next and other deps are real files, not symlinks.
    console.log('Copying standalone to electron/standalone-build (dereferenced)...');
    copyDirDereferenced(STANDALONE_SRC, STANDALONE_BUILD);

    // Next.js standalone requires .next/static and public/ to be copied alongside.
    var staticSrc = path.join(ROOT, '.next/static');
    var staticDest = path.join(STANDALONE_BUILD, '.next/static');
    copyDirDereferenced(staticSrc, staticDest);

    var publicSrc = path.join(ROOT, 'public');
    var publicDest = path.join(STANDALONE_BUILD, 'public');
    copyDirDereferenced(publicSrc, publicDest);

    // Verify next module exists.
    var nextPkg = path.join(STANDALONE_BUILD, 'node_modules/next/package.json');
    if (fs.existsSync(nextPkg)) {
        console.log('Verified: node_modules/next exists in standalone-build');
    } else {
        console.warn('WARNING: node_modules/next NOT found in standalone-build!');
    }

    // Copy node-thermal-printer and its dependencies (not bundled by Next.js standalone).
    var modulesToCopy = ['node-thermal-printer', 'iconv-lite', 'pngjs', 'unorm', 'write-file-queue'];
    for (var i = 0; i < modulesToCopy.length; i++) {
        var modName = modulesToCopy[i];
        var modSrc = path.join(ROOT, 'node_modules', modName);
        var modDest = path.join(STANDALONE_BUILD, 'node_modules', modName);
        if (fs.existsSync(modSrc) && !fs.existsSync(modDest)) {
            copyDirDereferenced(modSrc, modDest);
        }
    }

    // electron-builder strips node_modules from extraResources.
    // Rename to _node_modules to avoid this, then rename back at runtime.
    var nmDir = path.join(STANDALONE_BUILD, 'node_modules');
    var nmRenamed = path.join(STANDALONE_BUILD, '_node_modules');
    if (fs.existsSync(nmDir)) {
        fs.renameSync(nmDir, nmRenamed);
        console.log('Renamed node_modules -> _node_modules to avoid electron-builder stripping');
    }

    // Also rename .next/node_modules if it exists.
    var nextNmDir = path.join(STANDALONE_BUILD, '.next/node_modules');
    var nextNmRenamed = path.join(STANDALONE_BUILD, '.next/_node_modules');
    if (fs.existsSync(nextNmDir)) {
        fs.renameSync(nextNmDir, nextNmRenamed);
        console.log('Renamed .next/node_modules -> .next/_node_modules');
    }

    // Copy .env_prod.local into standalone-build as _env.local (renamed to avoid
    // electron-builder stripping .env*.local files). main.js renames it back at runtime.
    var envProdSrc = path.join(ROOT, '.env_prod.local');
    var envLocalDest = path.join(STANDALONE_BUILD, '_env.local');
    if (fs.existsSync(envProdSrc)) {
        fs.copyFileSync(envProdSrc, envLocalDest);
        console.log('Copied .env_prod.local -> standalone-build/_env.local');
    } else {
        console.warn('WARNING: .env_prod.local not found at project root');
    }

    console.log('Standalone preparation complete.');
}

main();
