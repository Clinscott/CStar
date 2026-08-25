# Corvus Star Source and Release Surfaces

This repository generates host source-staging and external-runtime release artifacts from the authoritative registry and runtime contracts.

## Gemini CLI
- Install from the repository root so `gemini-extension.json` and `GEMINI.md` are available.
- The extension exposes registry-filtered capabilities and MCP server wiring from the kernel root.
- Gemini context is generated around the host-native supervisor model: host cognition, kernel primitives.
- The Gemini context teaches bounded, on-demand Corvus Star Augury routing.
- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.
- Local source-link staging: `npm run install:gemini-local`; new-session pickup and live proof remain separate.

## Codex
- The repo-local plugin lives under `plugins/corvus-star/`.
- The marketplace entry lives under `.agents/plugins/marketplace.json`.
- The plugin is skill-only and intentionally contains no hooks, `.mcp.json`, or bundled kernel.
- Codex reaches CStar through the single host-global `cstar-kernel` registration defined by the current integration contract.
- `plugins/corvus-star/lineage.json` binds the immutable plugin version to its tool catalog, exported capabilities, runtime mode, and per-file hashes.
- Codex source-staging surfaces are generated from the same registry-backed host/kernel split as Gemini.
- Codex skill context teaches bounded, on-demand Corvus Star Augury routing.
- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.
- Source staging only: `npm run install:codex-local` verifies and stages the plugin under `~/plugins/corvus-star`; it does not run `codex plugin add`, refresh Codex cache, restart Desktop, or prove live activation.
- Marketplace reconciliation, `codex plugin add`, restart/new-task pickup, and live MCP proof are a separate operator-gated activation flow.

## Export Summary
- Gemini executable capabilities: 3
- Codex executable capabilities: 3

## Regeneration
- `npm run build:distributions`
- `npm run validate:distributions`
- `npm run build:release-bundles`
- `npm run build:release-archives`
- `npm run release:prepare`

## CI
- Pull requests and pushes should fail if generated host artifacts drift from the registry-backed source.
- Tagged pushes and manual runs can publish external-runtime-dependent host overlays from `dist/host-distributions/`; the archives do not bundle CStar itself.
- Stage source from generated artifacts, then use the separately operator-gated supported host activation flow instead of hand-editing host surfaces.
