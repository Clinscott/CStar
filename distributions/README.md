# Corvus Star Install Surfaces

This repository generates host install artifacts from the authoritative registry and runtime contracts.

## Gemini CLI
- Install from the repository root so `gemini-extension.json` and `GEMINI.md` are available.
- The extension exposes registry-filtered capabilities and MCP server wiring from the kernel root.
- Gemini context is generated around the host-native supervisor model: host cognition, kernel primitives.
- The Gemini context teaches the full-first/lite-after Corvus Star Augury display and routing contract.
- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.
- Local bootstrap: `npm run install:gemini-local`

## Codex
- The repo-local plugin lives under `plugins/corvus-star/`.
- The marketplace entry lives under `.agents/plugins/marketplace.json`.
- The plugin points back to the same kernel root through `.mcp.json`.
- Codex install surfaces are generated from the same registry-backed host/kernel split as Gemini.
- Codex skill context teaches the full-first/lite-after Corvus Star Augury display and routing contract.
- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.
- Local bootstrap: `npm run install:codex-local`

## Combined Local Bootstrap
- `npm run install:hosts-local`

## Export Summary
- Gemini executable capabilities: 76
- Codex executable capabilities: 76

## Regeneration
- `npm run build:distributions`
- `npm run validate:distributions`
- `npm run build:release-bundles`
- `npm run build:release-archives`
- `npm run release:prepare`

## CI
- Pull requests and pushes should fail if generated install artifacts drift from the registry-backed source.
- Tagged pushes and manual runs can publish host-ready bundle artifacts from `dist/host-distributions/`.
- Sync local `~/.gemini` and `~/.codex` installs from these generated artifacts instead of hand-editing host surfaces.
