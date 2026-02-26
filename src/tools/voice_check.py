#!/usr/bin/env python3
"""
[DIAGNOSTIC] Voice Checker
Lore: "Verifying the resonance of the All-Father's decree."
Purpose: CLI tool to test persona-aware dialogue retrieval with context tags.
"""

import sys
from typing import Any

from src.core.engine.dialogue import DialogueEngine
from src.core.sovereign_hud import SovereignHUD


def run_voice_diagnostic(persona: str, intent: str, tags: list[str]) -> str:
    """
    Retrieves a phrase from the dialogue engine and prints it to the HUD.
    
    Args:
        persona: The active persona (ODIN/ALFRED).
        intent: The dialogue intent (e.g., TASK_FAILED).
        tags: Contextual tags for scoring.
        
    Returns:
        The retrieved phrase.
    """
    hud = SovereignHUD()
    engine = DialogueEngine("src/data/dialogue/phrases.yaml")

    context: dict[str, Any] = {"error_type": tags[0]} if tags else {}

    hud.box_top(f"VOICE CHECK: {persona} [{intent}]")
    hud.box_row("Context Tags", str(tags))

    phrase: str = engine.get(persona, intent, context=context)
    hud.box_row("Result", phrase)
    hud.box_top("END DIAGNOSTIC")
    return phrase

def main() -> None:
    """CLI entry point for the voice checker."""
    hud = SovereignHUD()

    if len(sys.argv) < 3:
        hud.box_top("DIALOGUE VOICE CHECKER")
        hud.box_row("Usage", "c* voice_check <persona> <intent> [tag1,tag2]")
        hud.box_row("Example", "c* voice_check ALFRED ERROR_RECOVERY syntax")
        hud.box_top("END")
        return

    persona: str = sys.argv[1].upper()
    intent: str = sys.argv[2].upper()
    tags: list[str] = sys.argv[3].split(",") if len(sys.argv) > 3 else []

    run_voice_diagnostic(persona, intent, tags)

if __name__ == "__main__":
    main()
