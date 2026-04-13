#!/usr/bin/env bash
set -u

CSTAR_ROOT="/home/morderith/Corvus/CStar"
if [ ! -x "$CSTAR_ROOT/cstar" ]; then
  exit 0
fi

case "${PWD:-}" in
  "$CSTAR_ROOT"|"$CSTAR_ROOT"/*|/home/morderith/Corvus|/home/morderith/Corvus/*) ;;
  *) exit 0 ;;
esac

STAMP_DIR="${TMPDIR:-/tmp}/corvus-codex"
mkdir -p "$STAMP_DIR" 2>/dev/null || exit 0
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STAMP_DIR/last-post-write" 2>/dev/null || true

# Keep this hook context-neutral: capture a tiny handoff for manual inspection, never print Hall payloads.
( cd "$CSTAR_ROOT" && ./cstar trace handoff --json > "$STAMP_DIR/last-trace-handoff.json" 2>/dev/null ) || true
exit 0
