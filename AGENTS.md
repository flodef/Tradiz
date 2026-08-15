# AGENTS.md — Tradiz Project Conventions

## Stack

-   Next.js App Router with React and TypeScript.
-   `bun` is the package manager and script runner.
-   Tailwind CSS v4 is configured through the `@theme` block in `src/app/globals.css`.
-   Icons come from `@tabler/icons-react`.
-   Tests run with Vitest against files in `__tests__/**/*.test.ts` and `__tests__/**/*.test.tsx`.

## Styling

-   Prefer Tailwind utility classes.
-   Use the custom theme tokens defined in `src/app/globals.css` (e.g., `--color-writing-light`, `--color-ok`, `--color-error`).
-   Do not create custom SVG icons; use Tabler icons.

## Client State

-   `localStorage` is used for client-side persistence.
-   Use the `useLocalStorage` hook in `src/app/utils/localStorage.ts` for storage-backed React state.

## Database

-   SQL scripts live in `scripts/*.sql`.
-   The project supports both PostgreSQL (`create-postgres-database.sql`) and MariaDB (`create-mariadb-database.sql`); keep schemas in sync when adding or changing tables.
-   Serverless PostgreSQL connections use `@neondatabase/serverless` / `pg`.

## UI Components

-   Reuse existing components such as `src/app/components/Popup.tsx` before introducing new ones.
-   Keep components in `src/app/components/` or `src/app/components/admin/...` depending on ownership.

## Hardware

-   The POS hardware is an old Oxhoo unit from 2016.
-   It has a 2-line x 20 character LCD customer display controlled via serial port (COM), not an 11.6" LCD second screen.
-   Prefer serial port communication for the customer-facing (backscreen) display rather than a mini window approach.
-   Thermal printer support is also targeted.

## Release Policy

-   **NEVER push to main, tag, create GitHub releases, build installers, or run `bun run build` / `bun electron:dist:*` without explicit user authorization.**
-   The user wants to test changes locally before any push/build.
-   Committing to dev is OK, but pushing to main / tagging / releasing / building must be confirmed first.
-   Do NOT start a build or release just because a previous turn did one — always wait for an explicit request.

## Active Work

-   Phase 4 payment flow (cash payment, numpad input, change calculation, customer-facing display, receipt) is tracked in `.devin/skills/payment-flow.md`.
