#!/usr/bin/env bash
# Corvus Star SessionStart hook: emits a compact profile digest into agent context.
# Fails silently — a broken hook must never block a session.
set -u

if [ -z "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    exit 0
fi

SCRIPT="${CLAUDE_PLUGIN_ROOT}/scripts/profile-digest.mjs"
if [ ! -f "$SCRIPT" ]; then
    exit 0
fi

node "$SCRIPT" 2>/dev/null || true
