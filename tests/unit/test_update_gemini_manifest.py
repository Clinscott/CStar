from __future__ import annotations

from src.core.engine.bead_ledger import BeadLedger
from src.tools.update_gemini_manifest import ManifestOrchestrator


def test_manifest_uses_hall_beads_for_priority_directives(tmp_path, monkeypatch) -> None:
    (tmp_path / ".agents").mkdir()
    (tmp_path / "config.json").write_text('{"persona": "ODIN"}', encoding="utf-8")
    (tmp_path / "tasks.qmd").write_text(
        "## ⏭️ Start Here Next\n- misleading projection text\n",
        encoding="utf-8",
    )

    ledger = BeadLedger(tmp_path)
    ledger.upsert_bead(
        target_path="src/core/example.py",
        rationale="Repair sovereign queue projection drift.",
        contract_refs=["contracts/example.feature"],
        acceptance_criteria="Manifest derives priority from Hall.",
    )

    monkeypatch.setattr(
        ManifestOrchestrator,
        "_get_git_summary",
        staticmethod(lambda: "git summary"),
    )

    ManifestOrchestrator.execute(root=tmp_path)

    manifest = (tmp_path / "GEMINI.qmd").read_text(encoding="utf-8")
    assert "**Active Mind**: ODIN" in manifest
    assert "Repair sovereign queue projection drift." in manifest
    assert "`src/core/example.py`" in manifest
    assert "1 open / 0 in progress / 0 ready for review / 0 needs triage / 0 blocked / 0 resolved" in manifest
    assert "misleading projection text" not in manifest
