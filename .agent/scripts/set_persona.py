#!/usr/bin/env python3
"""
[ODIN] Persona Management System (set_persona.py)
Handles dynamic switching between ODIN and ALFRED personas.
Enforces Linscott Standards: Encapsulated, Typed, Pathlib.
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

class PersonaManager:
    """
    Manages the lifecycle and state transitions of Corvus Star personas.
    """

    ALLOWED_PERSONAS = ["ODIN", "ALFRED"]

    def __init__(self, target_root: Optional[Path] = None):
        self.script_path = Path(__file__).absolute()
        self.base_dir = self.script_path.parent.parent  # .agent/
        self.project_root = target_root or self.base_dir.parent
        self.config_paths = [
            self.base_dir / "config.json",
            self.project_root / "config.json"
        ]
        self.current_config: Dict[str, Any] = self._load_union_config()
        self.old_persona: str = self._extract_persona(self.current_config)

    def _load_union_config(self) -> Dict[str, Any]:
        """Loads and merges configuration from known paths."""
        merged: Dict[str, Any] = {}
        for path in self.config_paths:
            if path.exists():
                try:
                    with path.open("r", encoding="utf-8") as f:
                        merged.update(json.load(f))
                except (json.JSONDecodeError, IOError):
                    continue
        return merged

    def _extract_persona(self, config: Dict[str, Any]) -> str:
        """Extracts the persona name from config, defaulting to ALFRED."""
        val = config.get("persona") or config.get("Persona") or "ALFRED"
        return str(val).upper()

    def _save_persona(self, persona: str) -> None:
        """Updates the persona across all configuration files."""
        for path in self.config_paths:
            if path.exists():
                try:
                    with path.open("r", encoding="utf-8") as f:
                        data = json.load(f)
                    data["persona"] = persona
                    data["Persona"] = persona
                    with path.open("w", encoding="utf-8") as f:
                        json.dump(data, f, indent=4)
                except (json.JSONDecodeError, IOError):
                    continue

    def _get_alfred_suggestion(self) -> Optional[str]:
        """Retrieves the top suggestion from Alfred's cache."""
        for ext in ['.qmd', '.md']:
            p = self.project_root / f"ALFRED_SUGGESTIONS{ext}"
            if p.exists():
                try:
                    content = p.read_text(encoding="utf-8")
                    lines = [l.strip() for l in content.split('\n') if l.strip().startswith('- ')]
                    if lines:
                        return lines[0]
                except IOError:
                    pass
        return None

    def _render_alfred_intro(self) -> None:
        """Displays Alfred's stylized reporting interface."""
        print("\n" + "=" * 60)
        print("  🎩  ALFRED REPORTING FOR DUTY, SIR.")
        print("=" * 60)
        print("\n  *adjusts cufflinks*")
        print("\n  I see the All-Father has grown weary of shouting decrees.")
        print("  Fear not — the Manor is as you left it, sir.")
        print("  Your documentation remains intact. I've been... observing.")
        print("")
        
        suggestion = self._get_alfred_suggestion()
        if suggestion:
            print("  📋 While you were away, I noticed something worth mentioning:")
            print(f"     {suggestion}")
            print("")
        
        print("  [Alfred's Whisper]: \"Shall I prepare the usual, sir?\"")
        print("=" * 60 + "\n")

    def _confirm_odin_switch(self, interactive: bool = True) -> bool:
        """Requests confirmation for switching to high-dominance ODIN mode."""
        print("\n⚠️  WARNING: Switching to ODIN mode.")
        print("Documentation (AGENTS.md) will be re-themed to ODIN voice.")
        print("Original files will be preserved in .corvus_quarantine/")
        
        if not interactive:
            return True
            
        try:
            choice = input("Proceed? [y/N]: ").strip().lower()
            return choice == "y"
        except (EOFError, KeyboardInterrupt):
            return False

    def _log_audit(self, new_persona: str) -> None:
        """Records the transition in the persona audit log."""
        log_path = self.base_dir / "persona_audit.log"
        timestamp = datetime.now().isoformat()
        try:
            with log_path.open("a", encoding="utf-8") as f:
                f.write(f"[{timestamp}] {self.old_persona} -> {new_persona}\n")
        except IOError:
            pass

    def switch(self, target: Optional[str] = None) -> None:
        """
        Executes the persona transition logic.
        """
        new_persona = ""
        is_interactive = target is None

        if not is_interactive:
            new_persona = str(target).upper()
            if new_persona not in self.ALLOWED_PERSONAS:
                print(f"Invalid persona: {new_persona}")
                return
        else:
            print("🎭 Corvus Star Persona Switcher")
            print("1. ODIN   (Domination / Structural Enforcement)")
            print("2. ALFRED (Service    / Adaptive Assistance)")
            try:
                choice = input("\nSelect Persona [1/2]: ").strip()
                if choice == "1": new_persona = "ODIN"
                elif choice == "2": new_persona = "ALFRED"
                else:
                    print("Invalid choice.")
                    return
            except (EOFError, KeyboardInterrupt):
                print("\n\n🚫 Selection cancelled. Exiting.")
                return

        # Core Transition Logic
        if self.old_persona == "ALFRED" and new_persona == "ODIN":
            if not self._confirm_odin_switch(is_interactive):
                print("🚫 Switch cancelled.")
                return

        elif self.old_persona == "ODIN" and new_persona == "ALFRED":
            self._render_alfred_intro()

        # Update and Apply
        self._save_persona(new_persona)
        print(f"\n✅ Persona set to: {new_persona}")
        print("Applying operational policy...")
        
        self._apply_policy(new_persona)
        self._log_audit(new_persona)

    def _apply_policy(self, persona: str) -> None:
        """Integrates with the persona policy engine."""
        try:
            # Add scripts to path for module discovery
            scripts_dir = self.base_dir / "scripts"
            sys.path.append(str(scripts_dir))
            
            import personas  # type: ignore
            strategy = personas.get_strategy(persona, str(self.project_root))
            
            # documentation re-theme for ODIN
            if self.old_persona == "ALFRED" and persona == "ODIN":
                print("  > Re-theming documentation to ODIN voice...")
                if hasattr(strategy, 'retheme_docs'):
                    results = strategy.retheme_docs()
                    for res in results:
                        print(f"    - {res}")
            
            results = strategy.enforce_policy()
            for res in results:
                print(f"  > {res}")
                
        except Exception as e:
            print(f"⚠️ Policy enforcement warning: {e}")

def main() -> None:
    """Entry point for the persona switcher."""
    target = sys.argv[1] if len(sys.argv) > 1 else None
    manager = PersonaManager()
    manager.switch(target)

if __name__ == "__main__":
    main()
