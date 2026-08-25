#!/usr/bin/env python3
"""Explicit selector for CStar's presentation-only persona profile.

The selector may update only ``system.persona`` in the canonical configuration.
It never applies policy, rewrites documentation, or changes execution authority.
"""

# Intent: explicitly select the active presentation profile.

import json
import os
import stat
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from src.core import personas


class PersonaManager:
    """
    Manages the lifecycle and state transitions of Corvus Star personas.
    """

    ALLOWED_PERSONAS = ("ODIN", "ALFRED")

    def __init__(self, target_root: Path | None = None) -> None:
        self.script_path = Path(__file__).absolute()
        self.project_root = target_root or self.script_path.parent.parent.parent
        self.base_dir = self.project_root / ".agents"
        self.config_paths = [
            self.base_dir / "config.json"
        ]
        self.current_config: dict[str, Any] = self._load_union_config()
        self.old_persona: str = self._extract_persona(self.current_config)

    def _load_union_config(self) -> dict[str, Any]:
        """Loads and merges configuration from known paths."""
        merged: dict[str, Any] = {}
        for path in self.config_paths:
            if path.exists():
                try:
                    with path.open("r", encoding="utf-8") as f:
                        merged.update(json.load(f))
                except (OSError, json.JSONDecodeError):
                    continue
        return merged

    def _extract_persona(self, config: dict[str, Any]) -> str:
        """Extracts the persona name from config, defaulting to A.L.F.R.E.D."""
        system = config.get("system", {})
        val = system.get("persona") if isinstance(system, dict) else None
        if not val:
            val = config.get("persona") or config.get("Persona") or "ALFRED"
        return str(val).upper()

    def _save_persona(self, persona: str) -> None:
        """Atomically update only the canonical active-style field.

        Missing, malformed, or structurally ambiguous configuration fails
        closed. Existing authority and runtime fields are preserved unchanged.
        """
        if persona not in self.ALLOWED_PERSONAS:
            raise ValueError(f"unsupported persona style: {persona}")

        for path in self.config_paths:
            if path.is_symlink() or not path.is_file():
                raise RuntimeError(f"persona config is unavailable: {path}")

            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"persona config is unreadable: {path}") from exc

            if not isinstance(data, dict) or not isinstance(data.get("system"), dict):
                raise RuntimeError(
                    f"persona config lacks canonical object 'system': {path}"
                )

            updated = dict(data)
            updated_system = dict(data["system"])
            updated_system["persona"] = persona
            updated["system"] = updated_system

            serialized = json.dumps(updated, indent=4) + "\n"
            temp_fd: int | None = None
            temp_name: str | None = None
            try:
                temp_fd, temp_name = tempfile.mkstemp(
                    prefix=f".{path.name}.persona.",
                    suffix=".tmp",
                    dir=path.parent,
                )
                with os.fdopen(temp_fd, "w", encoding="utf-8") as handle:
                    temp_fd = None
                    handle.write(serialized)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.chmod(temp_name, stat.S_IMODE(path.stat().st_mode))
                os.replace(temp_name, path)
                temp_name = None
            except OSError as exc:
                if temp_fd is not None:
                    os.close(temp_fd)
                try:
                    if temp_name is not None:
                        Path(temp_name).unlink(missing_ok=True)
                except OSError:
                    pass
                raise RuntimeError(f"persona config update failed: {path}") from exc

        self.current_config = updated

    def _render_alfred_intro(self) -> None:
        """Displays a professional ALFRED style transition."""
        print("\nSwitching to the measured ALFRED presentation style.")
        print("Authority, policy, configuration other than system.persona, and docs are unchanged.")

    def _confirm_odin_switch(self, interactive: bool = True) -> bool:
        """Requests confirmation for switching to the direct ODIN style."""
        print("\nSwitching to the direct ODIN presentation style.")
        print("Authority, policy, configuration other than system.persona, and docs are unchanged.")

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
        except OSError:
            pass

    def switch(self, target: str | None = None) -> None:
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
            print("1. ODIN   (Direct / Systems emphasis)")
            print("2. ALFRED (Measured / Assistance emphasis)")
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

        # Update only the explicit active-style field.
        try:
            self._save_persona(new_persona)
        except (RuntimeError, ValueError) as exc:
            print(f"🚫 Persona selection failed closed: {exc}")
            return

        print(f"\n✅ Persona set to: {new_persona}")
        print("Presentation style updated; operational authority is unchanged.")

        self._render_style_context(new_persona)
        self._log_audit(new_persona)

    def _render_style_context(self, persona: str) -> None:
        """Render the selected style without invoking legacy policy methods."""
        strategy = personas.PersonaRegistry.get_strategy(persona, str(self.project_root))
        print(f"  > {strategy.render_style_context()}")

    @staticmethod
    def set_persona(persona: str, root: str | None = None) -> None:
        """Convenience function for external callers (e.g. tests, ravens)."""
        manager = PersonaManager(target_root=Path(root) if root else None)
        manager.switch(persona)

def main() -> None:
    """Entry point for the persona switcher."""
    target = sys.argv[1] if len(sys.argv) > 1 else None
    manager = PersonaManager()
    manager.switch(target)

if __name__ == "__main__":
    main()
