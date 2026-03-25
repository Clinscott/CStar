#!/bin/bash

# [Ω] CStarOS Uninstaller (Revert to User Space)
echo "◤ INITIATING CSTAR OS UNINSTALLATION ◢"

USER_HOME=$(eval echo ~$USER)
PROJECT_ROOT=$(pwd)

echo "  ↳ Removing global OS Mandates from host user space..."

# 1. Remove Claude OS Hook
if [ -f "$USER_HOME/CLAUDE.md" ]; then
    rm "$USER_HOME/CLAUDE.md"
    echo "    ◈ CLAUDE: Mandate removed."
fi

# 2. Remove Cursor/Codex OS Hook
if [ -f "$USER_HOME/.cursorrules" ]; then
    rm "$USER_HOME/.cursorrules"
    echo "    ◈ CURSOR: Mandate removed."
fi

# 3. Remove Gemini OS Hook
if [ -f "$USER_HOME/.gemini/GEMINI.md" ]; then
    rm "$USER_HOME/.gemini/GEMINI.md"
    echo "    ◈ GEMINI: Mandate removed."
fi

echo "  ↳ Disengaging Kernel Gatekeeper..."
# 4. Remove Git Hooks
HOOK_DIR="$PROJECT_ROOT/.git/hooks"
if [ -f "$HOOK_DIR/pre-commit" ]; then
    rm "$HOOK_DIR/pre-commit"
    echo "    ◈ GATEKEEPER: Disarmed."
fi

# 5. Remove Bash Aliases
BASHRC="$USER_HOME/.bashrc"
if grep -q "alias cstar=" "$BASHRC"; then
    # Cross-platform sed for removing the specific line
    sed -i.bak '/alias cstar=/d' "$BASHRC" && rm "$BASHRC.bak"
    echo "    ◈ SYS-ALIAS: 'cstar' removed from ~/.bashrc."
fi

echo "◤ THE KERNEL IS DORMANT. USER SPACE RESTORED. ◢"
