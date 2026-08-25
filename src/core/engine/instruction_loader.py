"""Registry-gated, read-only instruction loader.

Only agent-native skills explicitly registered by CStar can contribute prompt
instructions. Historical local skill folders and caller-supplied directories do
not grant capability or authority.
"""

from __future__ import annotations

import json
from pathlib import Path


class InstructionLoader:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root).resolve()
        self.registry_path = self.project_root / ".agents" / "skill_registry.json"
        self.extra_sources: list[Path] = []
        self._instruction_cache: dict[str, str] = {}

    def add_source(self, path: str) -> None:
        """Compatibility no-op: external paths cannot extend skill authority."""
        del path

    def _registered_instruction_paths(self) -> dict[str, Path]:
        try:
            payload = json.loads(self.registry_path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return {}

        entries = payload.get("entries")
        if not isinstance(entries, dict):
            return {}

        resolved: dict[str, Path] = {}
        for key, raw in entries.items():
            if not isinstance(key, str) or not isinstance(raw, dict):
                continue
            if raw.get("viability") != "ACTIVE" or raw.get("execution", {}).get("mode") != "agent-native":
                continue
            instruction_path = raw.get("instruction_path")
            if not isinstance(instruction_path, str) or not instruction_path.strip():
                continue
            candidate = (self.project_root / instruction_path).resolve()
            try:
                candidate.relative_to(self.project_root)
            except ValueError:
                continue
            resolved[key] = candidate
        return resolved

    def get_instructions(self, intent_ids: list[str]) -> str:
        formatted: list[str] = []
        for intent_id in intent_ids:
            content = self._fetch_skill_content(intent_id)
            if content:
                formatted.append(f"### SKILL: {intent_id}\n{content}")

        if not formatted:
            return ""
        return "\n\n---\n## ACTIVE SKILL INSTRUCTIONS\n" + "\n\n".join(formatted)

    def _fetch_skill_content(self, intent_id: str) -> str | None:
        normalized = intent_id.removeprefix("GLOBAL:").removeprefix("/")
        if normalized in self._instruction_cache:
            return self._instruction_cache[normalized]

        skill_path = self._registered_instruction_paths().get(normalized)
        if not skill_path or not skill_path.is_file():
            return None
        try:
            content = skill_path.read_text(encoding="utf-8")
        except OSError:
            return None
        self._instruction_cache[normalized] = content
        return content
