# Corvus Star Install Surfaces

This repository generates host install artifacts from the declared registry and kernel tool catalog.

## Gemini CLI
- Install from the repository root so `gemini-extension.json` and `GEMINI.md` are available.
- The extension exposes registry-filtered capabilities and MCP server wiring from the kernel root.
- Gemini context is generated around the host-native supervisor model: host cognition, kernel primitives.
- Gemini context presents Augury as an advisory route explanation, never authority or proof.
- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.

## Codex
- The source plugin under `plugins/corvus-star/` is skill-only: manifest, README, and skill.
- It contains no MCP server or hook. The host-global CStar kernel is managed independently.
- Install or update it only through the supported Codex plugin surface.
- Do not copy plugin caches or marketplace files by hand.
- Codex skill context presents Augury as an advisory route explanation, never authority or proof.
- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.

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
- Pull requests and pushes should fail if generated install artifacts drift from the registry-backed source.
- Tagged pushes and manual runs can publish host-ready bundle artifacts from `dist/host-distributions/`.
- Use supported host installation surfaces; never hand-edit Codex plugin caches or marketplace state.
