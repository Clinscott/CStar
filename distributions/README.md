# Corvus Star Source and Release Surfaces

This repository generates verified host source-staging artifacts from the declared registry and kernel tool catalog.

## Gemini CLI
- Install from the repository root so `gemini-extension.json` and `GEMINI.md` are available.
- The extension exposes registry-filtered capabilities and MCP server wiring from the kernel root.
- Gemini context is generated around the host-native supervisor model: host cognition, kernel primitives.
- Gemini context presents Augury as an advisory route explanation, never authority or proof.
- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.

## Codex
- The source plugin under `plugins/corvus-star/` is skill-only: manifest, README, skill, and generated lineage.
- It contains no MCP server or hook. The host-global CStar kernel is managed independently.
- `plugins/corvus-star/lineage.json` binds the immutable version to its tool catalog, exported capabilities, runtime mode, and per-file hashes.
- Source staging only: `npm run install:codex-local` verifies and stages the plugin under `~/plugins/corvus-star`; it does not run `codex plugin add`, refresh Codex cache, restart Desktop, or prove live activation.
- Marketplace reconciliation, `codex plugin add`, restart or new-task pickup, and live proof remain separately operator-gated.
- Never copy plugin caches or marketplace state by hand.
- Codex skill context presents Augury as an advisory route explanation, never authority or proof.
- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.

## Export Summary
- Gemini executable capabilities: 4
- Codex executable capabilities: 4

## Regeneration
- `npm run build:distributions`
- `npm run validate:distributions`
- `npm run build:release-bundles`
- `npm run build:release-archives`
- `npm run release:prepare`

## CI
- Pull requests and pushes should fail if generated host artifacts drift from the registry-backed source.
- Tagged pushes and manual runs can publish host-ready bundle artifacts from `dist/host-distributions/`.
- Stage verified source, then use the supported host activation surface; never hand-edit Codex plugin caches or marketplace state.
