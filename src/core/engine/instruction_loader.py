"""
[ENGINE] JIT Instruction Loader
Purpose: Dynamically fetches full skill instructions from disk for active intents.
"""

from pathlib import Path


class InstructionLoader:
    """
    Handles the Just-In-Time loading of SKILL.qmd contents to keep
    the LLM context window lean.
    """
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.skills_db_path = self.project_root / "skills_db"
        self.local_skills_path = self.project_root / "src" / "skills" / "local"
        self._instruction_cache: dict[str, str] = {}

    def get_instructions(self, intent_ids: list[str]) -> str:
        """
        Fetches and formats full instructions for a list of intent IDs.
        """
        formatted_instructions = []
        for intent_id in intent_ids:
            content = self._fetch_skill_content(intent_id)
            if content:
                formatted_instructions.append(f"### SKILL: {intent_id}\n{content}")

        if not formatted_instructions:
            return ""

        return "\n\n---\n## ACTIVE SKILL INSTRUCTIONS\n" + "\n\n".join(formatted_instructions)

    def _fetch_skill_content(self, intent_id: str) -> str | None:
        """Searches for and reads the SKILL.qmd for a given intent."""
        # Check Cache first
        if intent_id in self._instruction_cache:
            return self._instruction_cache[intent_id]

        # 1. Resolve Path
        skill_path = None

        # Handle GLOBAL: prefix
        if intent_id.startswith("GLOBAL:"):
            pure_id = intent_id.replace("GLOBAL:", "")
            skill_path = self.skills_db_path / pure_id / "SKILL.qmd"
        elif intent_id.startswith("/"):
            pure_id = intent_id[1:]
            # Local skills are often in folders named after the skill
            potential_paths = [
                self.local_skills_path / pure_id / "SKILL.qmd",
                self.local_skills_path / f"{pure_id}.qmd"
            ]
            for p in potential_paths:
                if p.exists():
                    skill_path = p
                    break

        # 2. Read Content
        if skill_path and skill_path.exists():
            try:
                content = skill_path.read_text(encoding='utf-8')
                self._instruction_cache[intent_id] = content
                return content
            except Exception:
                return None

        return None
