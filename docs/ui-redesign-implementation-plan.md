# UI Redesign Implementation Plan (Material + Flat + Card-Based)

Last updated: 2026-11-22

## Goal

Redesign MotoTrack UI with a Material-3 foundation, flat visual style, and card-based layout that prioritizes glanceability and action clarity while preserving current ride-tracking behavior.

## Progress Snapshot

- [x] Phase 1 foundation started and merged
- [ ] Phase 2 component standardization
- [ ] Phase 3 screen migrations
- [ ] Phase 4 accessibility + polish
- [ ] Phase 5 QA and release

## Phase 1: Foundation (Done/Started)

### Delivered

- New design tokens and palette system:
  - `constants/design-system.ts`
- Existing app theme bridged to design tokens:
  - `constants/theme.ts`
- Tab bar now uses tokenized colors:
  - `app/(tabs)/_layout.tsx`
- Base reusable primitives created:
  - `components/ui/app-card.tsx`
  - `components/ui/primary-button.tsx`
  - `components/ui/status-chip.tsx`

### Notes

- This phase is intentionally non-breaking and low risk.
- Legacy screen styles still work while we migrate screen-by-screen.

## Phase 2: Component Standardization

### Tasks

- [ ] Create `AppHeader` primitive for title + subtitle + right actions
  - New file: `components/ui/app-header.tsx`
- [ ] Create `StatCell` v2 style variant aligned with tokenized typography and spacing
  - Update: `components/stat-cell.tsx`
- [ ] Add `SecondaryButton` for non-primary actions
  - New file: `components/ui/secondary-button.tsx`
- [ ] Add `EmptyState` shared component
  - New file: `components/ui/empty-state.tsx`
- [ ] Add shared spacing/text utility styles for consistency
  - New file: `styles/ui.ts`

### Acceptance

- Components support light/dark palette through existing color-scheme hook.
- Primary/secondary/destructive button hierarchy is visually obvious.

## Phase 3: Screen Migrations

### 3.1 Ride Screen (Highest Priority)

- [ ] Refactor visual sections into `AppCard` blocks:
  - `app/(tabs)/index.tsx`
- [ ] Replace ad-hoc REC badge with `StatusChip`
  - `app/(tabs)/index.tsx`
- [ ] Standardize action zone using `PrimaryButton`/`SecondaryButton`
  - `app/(tabs)/index.tsx`
- [ ] Keep speed gauge but simplify surrounding noise and improve hierarchy
  - `app/(tabs)/index.tsx`

### 3.2 History Screen

- [ ] Convert row containers to consistent card pattern
  - `app/(tabs)/explore.tsx`
- [ ] Replace empty screen with `EmptyState`
  - `app/(tabs)/explore.tsx`
- [ ] Improve destructive confirmation hierarchy in modal
  - `app/(tabs)/explore.tsx`

### 3.3 Community Screen

- [ ] Adopt same header and card language as History
  - `app/(tabs)/community.tsx`
- [ ] Add standardized loading/error/empty states
  - `app/(tabs)/community.tsx`

### 3.4 Trip Detail Screens

- [ ] Align stats cards and map overlays to tokens
  - `app/trip/[id].tsx`
  - `app/cloud-trip/[id].tsx`
- [ ] Make stat hierarchy consistent with home/dashboard typography
  - `app/trip/[id].tsx`
  - `app/cloud-trip/[id].tsx`

## Phase 4: Accessibility + Motion

### Tasks

- [ ] Verify 4.5:1 contrast for text and status labels
  - Affects: `constants/design-system.ts` + all migrated screens
- [ ] Ensure touch targets >= 44x44
  - Affects: `components/ui/*`, screen action rows
- [ ] Keep only meaningful motion (status pulse, state transitions)
  - Affects: `app/(tabs)/index.tsx`

## Phase 5: QA + Release

### Tasks

- [ ] Lint and type checks
  - `npm run lint`
- [ ] Manual validation:
  - Start/pause/resume/stop ride
  - History navigation and delete flow
  - Community list navigation
  - Trip detail maps and stats
- [ ] Optional staged release behind feature flag

## Risks and Mitigations

- Risk: visual regressions from mixed old/new styles during migration.
  - Mitigation: migrate one screen at a time; keep primitives backward compatible.
- Risk: inconsistent typography until all screens are migrated.
  - Mitigation: enforce token usage in migrated files and follow checklist order.

## Recommended Execution Order

1. Complete Phase 2 primitives.
2. Migrate `app/(tabs)/index.tsx`.
3. Migrate `app/(tabs)/explore.tsx` and `app/(tabs)/community.tsx`.
4. Migrate trip detail pages.
5. Run accessibility pass and final QA.
