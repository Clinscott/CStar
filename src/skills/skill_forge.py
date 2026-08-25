"""Retired compatibility surface for the legacy in-process Skill Forge.

Reusable behavior is designed and validated through the supported skill and
CStar Forge workflows.  This module keeps only deterministic text classifiers;
it performs no RAG lookup, provider call, subprocess, or source write.
"""

from __future__ import annotations

import ast
import re


RETIRED_ERROR = "legacy_skill_forge_retired_use_cstar_forge_skill_workflow"


class SkillForge:
    """Pure compatibility classifiers plus fail-closed action methods."""

    ARCHETYPES = {
        "test": ("test", "verify", "check", "validate", "assert", "ensure"),
        "workflow": ("automate", "chain", "sequence", "batch", "pipeline", "orchestrate"),
        "utility": ("parse", "convert", "analyze", "extract", "transform", "process"),
        "scanner": ("scan", "audit", "lint", "inspect"),
        "scraper": ("scrape", "crawl", "fetch", "web", "html"),
    }
    DANGEROUS_PATTERNS = (
        r"\beval\s*\(",
        r"\bexec\s*\(",
        r"__import__\s*\(",
        r"subprocess\.(?:run|call|Popen|check_output)",
        r"os\.(?:system|popen)\s*\(",
        r"pickle\.loads?\s*\(",
    )

    def __init__(self, project_root: str) -> None:
        self.project_root = project_root

    def select_archetype(self, query: str, context: list[dict] | None = None) -> str:
        haystack = " ".join(
            [query, *[str(item.get("content", "")) for item in (context or [])]]
        ).lower()
        for archetype, triggers in self.ARCHETYPES.items():
            if any(trigger in haystack for trigger in triggers):
                return archetype
        return "utility"

    @staticmethod
    def _extract_subject(query: str) -> str:
        stripped = re.sub(
            r"^(?:create|make|build|generate|write|test|a|an|the)\s+",
            "",
            (query or "").lower(),
        )
        stripped = re.sub(r"\s+(?:for|to|from|with)\s+", " ", stripped)
        words = [word for word in stripped.split() if len(word) > 2 and word != "test"]
        subject = "_".join(words[-3:]) or "generated"
        subject = re.sub(r"[^a-z0-9_]", "_", subject)
        subject = re.sub(r"_+", "_", subject).strip("_") or "generated"
        return f"skill_{subject}" if subject[0].isdigit() else subject

    @classmethod
    def validate_skill(cls, code: str) -> tuple[bool, str]:
        for pattern in cls.DANGEROUS_PATTERNS:
            if re.search(pattern, code or ""):
                return False, f"Blocked dangerous pattern: {pattern}"
        try:
            ast.parse(code or "")
        except SyntaxError as exc:
            return False, f"Syntax error: {exc.msg}"
        return True, "Passed deterministic syntax and pattern checks."

    def forge(self, query: str, dry_run: bool = False) -> dict:
        raise RuntimeError(RETIRED_ERROR)

    def analyze_pattern(self, query: str) -> list[dict]:
        raise RuntimeError(RETIRED_ERROR)

    def synthesize_skill(self, *args: object, **kwargs: object) -> str:
        raise RuntimeError(RETIRED_ERROR)

    def _save_draft(self, *args: object, **kwargs: object) -> str:
        raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
