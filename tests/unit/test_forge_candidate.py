import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.forge_candidate import (
    build_forge_request_from_bead,
    normalize_lore_to_forge_request,
)
from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord


def seed_hall(root: Path) -> str:
    agents_dir = root / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-forge-1",
            repo_id=repo.repo_id,
            scan_kind="baseline",
            status="COMPLETED",
            baseline_gungnir_score=5.1,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-forge-1",
            path="src/core/forge_target.py",
            gungnir_score=2.3,
            created_at=1700000000200,
        )
    )
    return repo.repo_id


def test_build_forge_request_from_bead_uses_structured_inputs(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)
    bead = ledger.upsert_bead(
        target_path="src/core/forge_target.py",
        rationale="Refactor the forge target.",
        contract_refs=["contracts:forge-target"],
        acceptance_criteria="Raise the baseline above 5.0.",
    )

    request = build_forge_request_from_bead(
        tmp_path,
        bead.id,
        operator_constraints={"persona": "TALIESIN"},
    )

    assert request.bead_id == bead.id
    assert request.target_path == "src/core/forge_target.py"
    assert request.scan_id == "scan-forge-1"
    assert request.contract_refs == ["contracts:forge-target"]
    assert request.baseline_scores["overall"] == pytest.approx(2.3)
    assert request.operator_constraints["persona"] == "TALIESIN"


def test_build_forge_request_from_bead_requires_contract_refs(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)
    bead = ledger.upsert_bead(
        target_path="src/core/forge_target.py",
        rationale="Refactor the forge target.",
        contract_refs=["lore:feature_lore.qmd"],
        acceptance_criteria="Raise the baseline above 5.0.",
    )

    with pytest.raises(ValueError, match="canonical contract references"):
        build_forge_request_from_bead(tmp_path, bead.id)


def test_normalize_lore_to_forge_request_rejects_lore_as_contract_authority(tmp_path):
    seed_hall(tmp_path)
    lore_path = tmp_path / ".agents" / "forge_staged" / "feature_lore.qmd"
    lore_path.parent.mkdir(parents=True)
    lore_path.write_text(
        "Target Path: `src/core/forge_target.py`\nRefactor the lore-driven candidate into a bounded forge path.\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="not canonical contract input"):
        normalize_lore_to_forge_request(tmp_path, lore_path)

    assert BeadLedger(tmp_path).list_beads() == []


@pytest.mark.asyncio
async def test_taliesin_forge_returns_validation_ready_candidate_result(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)
    bead = ledger.upsert_bead(
        target_path="src/core/forge_target.py",
        rationale="Refactor the forge target.",
        contract_refs=["contracts:forge-target"],
        acceptance_criteria="Raise the baseline above 5.0.",
    )
    request = build_forge_request_from_bead(tmp_path, bead.id)

    with patch("src.sentinel.taliesin_forge.AntigravityUplink") as mock_uplink_cls, patch(
        "src.sentinel.taliesin_forge.TaliesinSpoke"
    ) as mock_spoke_cls:
        mock_uplink = AsyncMock()
        mock_uplink.send_payload.return_value = {
            "status": "success",
            "data": {
                "raw": json.dumps(
                    {
                        "target_path": "src/core/forge_target.py",
                        "code": "def execute(args: list[str]) -> None:\n    return None\n",
                        "summary": "Forge target refactor candidate",
                        "required_validations": ["crucible", "generated_tests"],
                    }
                )
            },
        }
        mock_uplink_cls.return_value = mock_uplink

        mock_spoke = MagicMock()
        mock_spoke.build_candidate_brief = AsyncMock(return_value="bounded candidate brief")
        mock_spoke_cls.return_value = mock_spoke

        from src.sentinel.taliesin_forge import TaliesinForge

        forge = TaliesinForge(tmp_path)
        result = await forge.forge_candidate(request)

    assert result is not None
    assert result.status == "STAGED"
    assert Path(result.staged_path).exists()
    assert result.generated_tests[0].path == "tests/gauntlet/test_forge_target.py"
    assert result.required_validations == ["crucible", "generated_tests"]
    assert result.validation_request is not None
    assert result.validation_request.staged_path == result.staged_path
    assert result.validation_request.acceptance_criteria == "Raise the baseline above 5.0."
    assert result.validation_request.contract_refs == ["contracts:forge-target"]
    assert result.validation_request.generated_tests[0].path == "tests/gauntlet/test_forge_target.py"
    assert result.trace_metadata["request_source"] == "bead"


@pytest.mark.asyncio
async def test_taliesin_forge_rejects_live_lore_execution(tmp_path):
    seed_hall(tmp_path)
    lore_path = tmp_path / ".agents" / "forge_staged" / "feature_lore.qmd"
    lore_path.parent.mkdir(parents=True)
    lore_path.write_text(
        "Target Path: `src/core/forge_target.py`\nRefactor the lore-driven candidate into a bounded forge path.\n",
        encoding="utf-8",
    )

    with patch("src.sentinel.taliesin_forge.AntigravityUplink"), patch(
        "src.sentinel.taliesin_forge.TaliesinSpoke"
    ), patch("src.sentinel.taliesin_forge.SovereignHUD") as mock_hud:
        from src.sentinel.taliesin_forge import TaliesinForge

        forge = TaliesinForge(tmp_path)
        result = await forge.weave_code_from_lore(lore_path)

    assert result is False
    assert BeadLedger(tmp_path).list_beads() == []
    mock_hud.log.assert_any_call(
        "FAIL",
        "Legacy lore-file forge is no longer canonical. Create a bead and invoke TALIESIN with --bead-id.",
    )
