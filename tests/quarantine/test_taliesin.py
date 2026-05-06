"""
[VIGIL] Unit Tests for Unified TALIESIN Spoke
Covers: TaliesinSpoke (ingest_style, seer_chamber, parse_chant, phoenix_loop, staging_gate)
"""

import json
import asyncio
import pytest
import sys
import io
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock

# Add skill directory to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
SKILL_SCRIPTS = PROJECT_ROOT / ".agents" / "skills" / "taliesin" / "scripts"
TALIESIN_SCRIPTS = PROJECT_ROOT.parent / "Taliesin" / "scripts"

if str(SKILL_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SKILL_SCRIPTS))
if str(TALIESIN_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(TALIESIN_SCRIPTS))

# ---------------------------------------------------------------------------
# XAPI Tests
# ---------------------------------------------------------------------------

class TestXAPI:
    """Isolation tests for the X API wrapper."""

    @patch("x_api.SovereignHUD")
    def test_post_article_simulated_when_unconfigured(self, mock_hud: MagicMock):
        """Unconfigured XAPI simulates post and returns True."""
        with patch.dict("os.environ", {}, clear=True):
            from x_api import XAPI
            api = XAPI()
            result = api.post_article("Test content")
            assert result is True
            mock_hud.persona_log.assert_any_call("WARN", "X API Credentials not found. Post simulated.")

# ---------------------------------------------------------------------------
# TaliesinSpoke Tests
# ---------------------------------------------------------------------------

@pytest.fixture
def taliesin_root(tmp_path: Path) -> Path:
    """Creates a minimal project root with .lore/ structure for testing."""
    lore_dir = tmp_path / ".lore"
    lore_dir.mkdir()
    voices_dir = lore_dir / "voices"
    voices_dir.mkdir()
    (voices_dir / "UserStyle.feature").write_text(
        "Feature: UserStyle\n  Scenario: Default\n    Given the bard speaks\n    Then it sounds like lore\n",
        encoding="utf-8",
    )
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "dev_journal.qmd").write_text("Journal entry", encoding="utf-8")
    (tmp_path / ".agents").mkdir()
    (tmp_path / ".agents" / "memory.qmd").write_text("Memory entry", encoding="utf-8")
    return tmp_path

@patch("taliesin_spoke.XAPI")
@patch("taliesin_spoke.AntigravityUplink")
@patch("taliesin_spoke.SovereignHUD")
def create_spoke(root: Path, mock_hud: MagicMock, mock_uplink_cls: MagicMock, mock_xapi_cls: MagicMock):
    """Helper: creates a TaliesinSpoke with fully mocked externals."""
    from taliesin_spoke import TaliesinSpoke
    mock_uplink = AsyncMock()
    mock_uplink_cls.return_value = mock_uplink
    mock_xapi = MagicMock()
    mock_xapi_cls.return_value = mock_xapi
    spoke = TaliesinSpoke(root)
    return spoke, mock_uplink, mock_xapi, mock_hud

class TestChantLogic:
    """Tests for chant parsing and interactive collection."""

    def test_parse_chant_valid(self, taliesin_root: Path):
        spoke, _, _, _ = create_spoke(taliesin_root)
        intent = "[MODE]: story [INTENT]: A quest [BLOCKING]: None [ANCHORS]: sword [BANS]: technology"
        chant = spoke.parse_chant(intent)
        assert chant["mode"] == "story"
        assert chant["intent"] == "A quest"
        assert chant["anchors"] == "sword"

    def test_seer_chamber_interactive(self, taliesin_root: Path):
        spoke, _, _, _ = create_spoke(taliesin_root)
        # Mock stdin to provide answers for: mode, intent, blocking, anchors, bans
        input_data = "story\nTest Intent\nNone\nAnchor1\nBan1\n"
        with patch("sys.stdin", io.StringIO(input_data)):
            chant = asyncio.run(spoke.seer_chamber())
        
        assert chant["mode"] == "story"
        assert chant["intent"] == "Test Intent"
        assert chant["anchors"] == "Anchor1"

class TestPhoenixLoop:
    """Tests for the iterative refinement process."""

    def test_phoenix_loop_threshold_achieved(self, taliesin_root: Path):
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        
        # Sequence of responses: Forge V1, Audit (96%)
        mock_uplink.send_payload.side_effect = [
            {"status": "success", "data": {"raw": "Draft V1"}}, # Forge
            {"status": "success", "data": {"raw": "Great job. SCORE: 96/100"}} # Audit
        ]
        
        chant = {"mode": "story", "intent": "Test"}
        result = asyncio.run(spoke.phoenix_loop(chant))
        
        assert result == "Draft V1"
        assert mock_uplink.send_payload.call_count == 2

    def test_phoenix_loop_requires_refinement(self, taliesin_root: Path):
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        
        # Sequence: Forge V1, Audit (80%), Recast, Audit (97%)
        mock_uplink.send_payload.side_effect = [
            {"status": "success", "data": {"raw": "Draft V1"}}, # Forge
            {"status": "success", "data": {"raw": "Too generic. SCORE: 80/100"}}, # Audit 1
            {"status": "success", "data": {"raw": "Draft V2"}}, # Recast
            {"status": "success", "data": {"raw": "Perfect. SCORE: 97/100"}} # Audit 2
        ]
        
        chant = {"mode": "story", "intent": "Test"}
        result = asyncio.run(spoke.phoenix_loop(chant))
        
        assert result == "Draft V2"
        assert mock_uplink.send_payload.call_count == 4

class TestIngestStyle:
    """Tests for style ingestion and contract update."""

    def test_ingest_updates_contract(self, taliesin_root: Path):
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        (taliesin_root / ".lore" / "sample.txt").write_text("Visceral writing style.", encoding="utf-8")
        
        mock_uplink.send_payload.return_value = {
            "status": "success", 
            "data": {"raw": "Feature: Updated Voice\n  Scenario: Refined\n"}
        }

        result = asyncio.run(spoke.ingest_style())
        assert result is True
        
        contract = (taliesin_root / ".lore" / "voices" / "UserStyle.feature").read_text(encoding="utf-8")
        assert "Feature: Updated Voice" in contract

class TestStagingGate:
    """Tests for the approval/rejection logic."""

    def test_staging_gate_terminal_approve(self, taliesin_root: Path):
        spoke, _, mock_xapi, _ = create_spoke(taliesin_root)
        mock_xapi.post_article.return_value = True

        with patch("builtins.input", return_value="y"):
            result = spoke.staging_gate("Final prose")

        assert result is True
        mock_xapi.post_article.assert_called_once_with("Final prose")


class TestManuscriptOptimizer:
    """Tests for optimizer fidelity gate behavior in the mounted Taliesin spoke."""

    def test_deterministic_fidelity_scores_token_overlap(self, tmp_path: Path):
        from manuscript_optimizer import ManuscriptOptimizer
        optimizer = ManuscriptOptimizer(tmp_path, tmp_path / "Taliesin")
        score = optimizer.deterministic_fidelity("wolf moon river", "wolf moon star river")
        assert score == 75.0

    def test_run_loop_rejects_high_score_mutation_below_fidelity_floor(self, tmp_path: Path):
        from manuscript_optimizer import ManuscriptOptimizer, AuditScores

        cstar_root = tmp_path / "cstar"
        spoke_root = tmp_path / "Taliesin"
        manuscript_dir = cstar_root / ".lore" / "samples"
        manuscript_dir.mkdir(parents=True)
        (manuscript_dir / "Fallows Hallow - TALIESIN.txt").write_text(
            "\n".join(["front"] * 31 + ["PROLOGUE", "The old words bind the valley.", "CHAPTER I", "Next"]),
            encoding="utf-8",
        )

        optimizer = ManuscriptOptimizer(cstar_root, spoke_root)
        optimizer.baseline_path.write_text(json.dumps({"voice_signature": "mythic"}), encoding="utf-8")

        calls = {"count": 0}

        async def fake_grade(candidate: str, original: str, baseline: dict):
            calls["count"] += 1
            if calls["count"] == 1:
                return AuditScores(75.0, 75.0, 75.0, 75.0, 100.0, "baseline")
            return AuditScores(99.0, 99.0, 99.0, 99.0, 40.0, "high-score low-fidelity")

        async def fake_mutate(current: str, audit: AuditScores, baseline: dict):
            return "completely divergent content"

        optimizer.grade = fake_grade  # type: ignore[assignment]
        optimizer.mutate = fake_mutate  # type: ignore[assignment]

        result = asyncio.run(optimizer.run_chapter_loop("Prologue", 1))
        output_text = Path(result["output_path"]).read_text(encoding="utf-8")
        ledger = json.loads(optimizer.ledger_path.read_text(encoding="utf-8"))

        assert output_text == "The old words bind the valley."
        assert ledger["runs"][-1]["adopted"] is False
        assert ledger["runs"][-1]["fidelity_score"] == 40.0

    def test_run_loop_adopts_mutation_above_fidelity_floor_with_better_average(self, tmp_path: Path):
        from manuscript_optimizer import ManuscriptOptimizer, AuditScores

        cstar_root = tmp_path / "cstar"
        spoke_root = tmp_path / "Taliesin"
        manuscript_dir = cstar_root / ".lore" / "samples"
        manuscript_dir.mkdir(parents=True)
        (manuscript_dir / "Fallows Hallow - TALIESIN.txt").write_text(
            "\n".join(["front"] * 31 + ["PROLOGUE", "Lanterns trembled above the ford.", "CHAPTER I", "Next"]),
            encoding="utf-8",
        )

        optimizer = ManuscriptOptimizer(cstar_root, spoke_root)
        optimizer.baseline_path.write_text(json.dumps({"voice_signature": "mythic"}), encoding="utf-8")

        calls = {"count": 0}

        async def fake_grade(candidate: str, original: str, baseline: dict):
            calls["count"] += 1
            if calls["count"] == 1:
                return AuditScores(70.0, 70.0, 70.0, 70.0, 100.0, "baseline")
            return AuditScores(90.0, 92.0, 93.0, 91.0, 95.0, "strong and faithful")

        async def fake_mutate(current: str, audit: AuditScores, baseline: dict):
            return "Lanterns trembled above the ford, and the oath held."

        optimizer.grade = fake_grade  # type: ignore[assignment]
        optimizer.mutate = fake_mutate  # type: ignore[assignment]

        result = asyncio.run(optimizer.run_chapter_loop("Prologue", 1))
        output_text = Path(result["output_path"]).read_text(encoding="utf-8")
        ledger = json.loads(optimizer.ledger_path.read_text(encoding="utf-8"))

        assert output_text == "Lanterns trembled above the ford, and the oath held."
        assert ledger["runs"][-1]["adopted"] is True
        assert ledger["runs"][-1]["fidelity_score"] == 95.0
