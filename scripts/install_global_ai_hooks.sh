#!/bin/bash

# [Ω] CStar Global Framework Injector
echo "[🔱] Mounting Corvus Star (C*) globally to the operator environment..."

PROJECT_ROOT="/home/morderith/Corvus/CStar"
USER_HOME="/home/morderith"

# 1. Inject Claude Code
if [ -f "$PROJECT_ROOT/CLAUDE.md" ]; then
    cp "$PROJECT_ROOT/CLAUDE.md" "$USER_HOME/CLAUDE.md"
    echo "  ↳ [CLAUDE]: Injected CStar mandate."
fi

# 2. Inject Cursor/Codex
if [ -f "$PROJECT_ROOT/.cursorrules" ]; then
    cp "$PROJECT_ROOT/.cursorrules" "$USER_HOME/.cursorrules"
    echo "  ↳ [CURSOR]: Injected Gungnir formatting rules."
fi

# 3. Inject global Gemini Context (fallback for sub-directories)
mkdir -p "$USER_HOME/.gemini"
if [ -f "$PROJECT_ROOT/.gemini/GEMINI.md" ]; then
    cp "$PROJECT_ROOT/.gemini/GEMINI.md" "$USER_HOME/.gemini/GEMINI.md"
    echo "  ↳ [GEMINI]: Injected global project context."
fi

echo "[Ω] Framework successfully linked. The Totem is awake."
