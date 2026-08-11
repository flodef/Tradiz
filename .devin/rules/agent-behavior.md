# Agent Behavior Rules — Tradiz

## Package Manager & Scripts

-   Use `bun` and `bunx` for all package management, scripts, and one-off commands.
-   Do **not** run `bun dev`, `next dev`, or any command to restart the app. The development server is already running in the background and will hot-reload code changes.

## Code Style & Tooling

-   Format code with Prettier and lint with ESLint.
-   Use Tailwind CSS for styling. This project uses Tailwind CSS v4 with the theme defined via `@theme` in `src/app/globals.css`.
-   Use `@tabler/icons-react` for icons. Do not generate custom SVGs.

## Git

-   Do not run `git commit`, `git push`, `git merge`, or any other write-oriented git operation unless the user explicitly asks for it.

## Builds & Releases

-   Bump `package.json` version before rebuilding the Electron app or creating a release. The auto-updater only triggers on higher version numbers, and reinstalling the same version can cause issues.
-   Follow the release workflow in `.devin/skills/release/SKILL.md` when publishing.

## Planning & Communication

-   Use the `todo_list` tool to plan and track work.
-   Ask clarifying questions whenever the requirements, scope, or context are unclear.
