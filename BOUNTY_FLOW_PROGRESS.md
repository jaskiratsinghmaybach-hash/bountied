# Bounty Flow - Progress Log

## Layout Spacing Polish - 2026-08-14

Responsive layout audit on /problems/new. No new features.

### page.tsx
- Removed max-w-4xl. Full width now.
- Fixed header padding: px-8 sm:px-0 was dropping padding at sm+. Now py-8 on main with px-6 sm:px-10 on the header row, matching workspace-layout internal padding.

### workspace-layout.tsx
- Outer area (workspace mode): flex+xl:flex-row -> grid grid-cols-[3fr_1fr]. Right panel is 1fr (~25%), main is 3fr (~75%). No hardcoded pixel widths.
- Outer area (pills mode): removed max-w-2xl and added px-6 sm:px-10 py-8 w-full to match alignment with the header across all selection steps.
- Removed xl:w-[360px] from right panel (grid column handles it).
- Removed xl:pb-20 from main content.
- Sticky offset: xl:top-[88px] (raw px) -> xl:top-14 (Tailwind scale).

### step-bounty-type.tsx
- Updated grid layout from sm:grid-cols-2 max-w-xl to responsive grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full to expand options beautifully on large displays.

### bounty-flow.tsx
- Removed sm:grid-cols-2 sub-grid around Deadline+RunCommand inside tier3. They were already in the half-width Details column, so a 2-col subgrid made each ~25% of total width, causing 'python main.p' truncation. Now stacked vertically at full column width.

### tsc check
Pre-existing errors only. No new errors introduced.
