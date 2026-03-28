# Corvus Star Install Surfaces

This repository generates host install artifacts from the authoritative registry and runtime contracts.

## Gemini CLI
- Install from the repository root so `gemini-extension.json` and `GEMINI.md` are available.
- The extension exposes registry-filtered capabilities and MCP server wiring from the kernel root.
- Local bootstrap: `npm run install:gemini-local`

## Codex
- The repo-local plugin lives under `plugins/corvus-star/`.
- The marketplace entry lives under `.agents/plugins/marketplace.json`.
- The plugin points back to the same kernel root through `.mcp.json`.
- Local bootstrap: `npm run install:codex-local`

## Combined Local Bootstrap
- `npm run install:hosts-local`

## Export Summary
- Gemini executable capabilities: 67
- Codex executable capabilities: 67

## Regeneration
- `npm run build:distributions`
- `npm run validate:distributions`
- `npm run build:release-bundles`
- `npm run build:release-archives`
- `npm run release:prepare`

## CI
- Pull requests and pushes should fail if generated install artifacts drift from the registry-backed source.
- Tagged pushes and manual runs can publish host-ready bundle artifacts from `dist/host-distributions/`.
