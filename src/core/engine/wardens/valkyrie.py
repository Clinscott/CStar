"""
[Valkyrie: PRUNING]
Lore: "Choosers of the Slain."
Purpose: Identify unused imports and unreachable code using Vulture.
"""

from pathlib import Path
from typing import Any

try:
    import vulture
except ImportError:
    class _UnavailableVulture:
        Vulture = None

    vulture = _UnavailableVulture()

from src.core.engine.wardens.base import BaseWarden


def _require_vulture() -> None:
    """Fail when dead-code analysis is invoked without its dependency."""
    if vulture.Vulture is None:
        raise RuntimeError("optional_dependency_unavailable:vulture")


class ValkyrieWarden(BaseWarden):
    def __init__(self, root: Path, *, confidence_threshold: int = 60) -> None:
        super().__init__(root)
        self.confidence_threshold = confidence_threshold

    def scan(self) -> list[dict[str, Any]]:
        _require_vulture()
        targets = []
        v = vulture.Vulture(verbose=False)
        py_files = []

        # Scavenge all python files not in ignored dirs
        for p in self.root.rglob("*.py"):
            if self._should_ignore(p):
                continue
            py_files.append(str(p))

        v.scavenge(py_files)

        raw_items = v.get_unused_code()

        for item in raw_items:
            # Ignore structural files
            if "__init__.py" in item.filename:
                continue

            if item.confidence < self.confidence_threshold:
                continue

            lineno = getattr(item, "first_lineno", getattr(item, "lineno", 1))

            try:
                rel_path = str(Path(item.filename).resolve().relative_to(self.root.resolve()))
            except ValueError:
                rel_path = str(item.filename)

            targets.append({
                "type": "VALKYRIE_BREACH",
                "file": rel_path,
                "action": f"Prune Dead Code: {item.message} at line {lineno} (Confidence: {item.confidence}%)",
                "severity": "LOW",
                "line": lineno
            })
        return targets
