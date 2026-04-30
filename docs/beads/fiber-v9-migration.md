---
bead_id: fiber-v9-migration
status: pending
created: 2026-04-19
created_during: corvus-star plugin scaffold (task #4, keyring install)
priority: low
scope: vis-layer
---

# Bead: Migrate `@react-three/fiber` to v9

## Why this exists

Surfaced on 2026-04-19 during `npm install @napi-rs/keyring` for the corvus-star plugin. `@react-three/postprocessing@3.0.4` declares peer `@react-three/fiber@^9.0.0`, but CStar pins `@react-three/fiber@^8.18.0`. Current workaround: `--legacy-peer-deps` (install succeeds, runtime works fine — the peer range is over-declared, not a real incompatibility).

## What to do

1. Bump `@react-three/fiber` from `^8.18.0` → `^9.x`.
2. Audit `src/tools/pennyone/vis/` for Fiber v9 breaking changes: renderer root API, event system, store internals.
3. Review `@react-three/drei@^9.122.0` for compatible version (drei v10 tracks Fiber v9).
4. Bump `@types/three` from `^0.150.2` to match `three@^0.170.0` (currently 20 minor versions stale — will likely surface here).
5. Verify the Dominion UI (`./cstar dominion`) and any three.js-rendered PennyOne visualizations still work end-to-end.
6. Once complete, remove `--legacy-peer-deps` from any install instructions; peer range should resolve cleanly.

## Not to be wedged into

The corvus-star plugin work, ENM B-IDE integration, or any auth/memory changes. This is a vis-layer migration and deserves its own PR.

## Acceptance

- `npm install` succeeds without `--legacy-peer-deps`.
- All PennyOne vis scenes render.
- Type-check clean on vis/ files.
