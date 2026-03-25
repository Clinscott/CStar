#!/bin/bash

# [Ω] CStarOS Installer & Integrity Lock
echo "◤ INITIATING CSTAR OS INSTALLATION (RING 0) ◢"

PROJECT_ROOT=$(pwd)
USER_HOME=$(eval echo ~$USER)

# Verify we are in the right directory
if [ ! -f "$PROJECT_ROOT/cstar.ts" ]; then
    echo "[FAIL] Must be run from the CStar root directory."
    exit 1
fi

echo "  ↳ Syncing global OS Mandates to host user space..."

# 1. Claude OS Hook
if [ -f "$PROJECT_ROOT/CLAUDE.md" ]; then
    cp "$PROJECT_ROOT/CLAUDE.md" "$USER_HOME/CLAUDE.md"
    echo "    ◈ CLAUDE: Sovereign."
fi

# 2. Cursor/Codex OS Hook
if [ -f "$PROJECT_ROOT/.cursorrules" ]; then
    cp "$PROJECT_ROOT/.cursorrules" "$USER_HOME/.cursorrules"
    echo "    ◈ CURSOR: Sovereign."
fi

# 3. Gemini OS Hook
mkdir -p "$USER_HOME/.gemini"
if [ -f "$PROJECT_ROOT/.gemini/GEMINI.md" ]; then
    cp "$PROJECT_ROOT/.gemini/GEMINI.md" "$USER_HOME/.gemini/GEMINI.md"
    echo "    ◈ GEMINI: Sovereign."
fi

echo "  ↳ Engaging Kernel Gatekeeper (Hardware Lock)..."
# 4. Git Hooks (The Integrity Lock)
HOOK_DIR="$PROJECT_ROOT/.git/hooks"
if [ -d "$HOOK_DIR" ]; then
    cp "$PROJECT_ROOT/scripts/gatekeeper.py" "$HOOK_DIR/pre-commit"
    chmod +x "$HOOK_DIR/pre-commit"
    echo "    ◈ GATEKEEPER: Armed."
else
    echo "    [WARN] No .git directory found. Gatekeeper bypassed."
fi

# 5. Bash Aliases (Optional convenience)
BASHRC="$USER_HOME/.bashrc"
if ! grep -q "alias cstar=" "$BASHRC"; then
    echo "alias cstar='npx tsx $PROJECT_ROOT/cstar.ts'" >> "$BASHRC"
    echo "    ◈ SYS-ALIAS: 'cstar' registered."
fi

echo "◤ THE KERNEL IS ABSOLUTE. CSTAR OS IS NOW ACTIVE. ◢"
