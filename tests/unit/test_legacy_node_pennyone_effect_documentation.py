"""Documentation contract for retired Node and PennyOne effects."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_legacy_node_pennyone_effects_are_documented_as_retired() -> None:
    operation = (ROOT / "docs/operations/legacy-node-pennyone-effect-boundary.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_legacy_node_pennyone_effects.feature").read_text(
        encoding="utf-8"
    )
    current = (ROOT / "docs/integrations/cstar-kernel-mcp.md").read_text(encoding="utf-8")

    compact = " ".join(operation.split()).lower()
    assert "cstar_pennyone_context" in compact
    assert "javascript sentinel" in compact and "import-time" in compact
    assert "websocket" in compact and "eventmanager" in compact
    assert "before filesystem traversal" in compact
    assert "no listener, client, timer, watcher" in feature
    assert "bounded read-only context from pennyone/hall" in " ".join(current.lower().split())
