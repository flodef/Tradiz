---
name: release
description: Merge dev into main, bump version, tag, push, and create a GitHub release to trigger the CI build and auto-updater
---

# GH Release workflow

## Prerequisites

-   On `dev` branch with all changes committed and pushed
-   `package.json` version has been bumped; the auto-updater only triggers on higher version numbers, and reinstalling the same version can cause issues
-   `origin/main` is the production branch
-   GitHub Actions workflow `build-windows-installer.yml` triggers on `release: published`

## One-shot command

Adjust `VERSION` if needed. This merges dev into main, tags, pushes, and creates a GitHub release.

```bash
VERSION=$(bun -e 'console.log(require("./package.json").version)') && \
git checkout main && \
git merge dev --no-edit && \
git tag "v${VERSION}" && \
git push origin main && \
git push origin "v${VERSION}" && \
gh release create "v${VERSION}" --title "v${VERSION}" --notes "Release v${VERSION}" --latest && \
git checkout dev
```

## What happens next

1. The `build-windows-installer.yml` workflow fires on the new release
2. It runs `bun electron:publish:win` which builds the installer and uploads `latest-ia32.yml` + assets to the GitHub release
3. The auto-updater in existing POS installations polls the GitHub releases feed, sees the new version, and prompts the user to update

## Verifying

```bash
# Check workflow status
gh run list --limit 3

# Check release assets
gh release view "v${VERSION}"
```

# Local build (no GitHub CI)

Build installers locally to copy directly to the POS without relying on GitHub Actions.

## Windows (ia32 + x64)

```bash
bun electron:dist:win:ci
```

Output: `dist/Tradiz-<version>-win-ia32.exe` and `dist/Tradiz-<version>-win-x64.exe`

Copy the `ia32` installer to the POS (32-bit Oxhoo) and run it.

## Linux (x64)

```bash
bun electron:dist:linux:ci
```

Output: `dist/Tradiz-<version>-linux-x86_64.AppImage` and `dist/Tradiz-<version>-linux-amd64.deb`

## Quick copy to POS (via network share or USB)

```bash
# Adjust the path to match your POS network share / USB mount
cp dist/Tradiz-$(bun -e 'console.log(require("./package.json").version)')-win-ia32.exe /media/usb/
```
