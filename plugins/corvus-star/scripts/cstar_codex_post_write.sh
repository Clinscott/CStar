#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_CSTAR_ROOT="$(cd -- "$SCRIPT_DIR/../../.." && pwd)"
CSTAR_ROOT="${CSTAR_ROOT:-$DEFAULT_CSTAR_ROOT}"
if [ ! -x "$CSTAR_ROOT/cstar" ]; then
  exit 0
fi

CSTAR_ESTATE_ROOT="$(dirname -- "$CSTAR_ROOT")"
case "${PWD:-}" in
  "$CSTAR_ROOT"|"$CSTAR_ROOT"/*|"$CSTAR_ESTATE_ROOT"|"$CSTAR_ESTATE_ROOT"/*) ;;
  *) exit 0 ;;
esac

STAMP_DIR="${TMPDIR:-/tmp}/corvus-codex"
mkdir -p "$STAMP_DIR" 2>/dev/null || exit 0
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STAMP_DIR/last-post-write" 2>/dev/null || true

# Keep this hook context-neutral: capture a tiny handoff for manual inspection, never print Hall payloads.
( cd "$CSTAR_ROOT" && ./cstar augury handoff --json > "$STAMP_DIR/last-augury-handoff.json" 2>/dev/null ) || true
exit 0
