"""
[VIGIL] Unit Tests for TALIESIN Spoke & XAPI
Covers: TaliesinSpoke (ingest_style, gather_context, generate_post, staging_gate) + XAPI
"""

import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock


# ---------------------------------------------------------------------------
# XAPI Tests
# ---------------------------------------------------------------------------

class TestXAPI:
    """Isolation tests for the X API wrapper (lazy-init)."""

    @patch("src.sentinel.x_api.SovereignHUD")
    def test_load_credentials_returns_true_when_all_present(self, _mock_hud: MagicMock):
        """_load_credentials returns True when all 4 env vars are set."""
        env = {
            "X_API_KEY": "key",
            "X_API_SECRET": "secret",
            "X_ACCESS_TOKEN": "token",
            "X_ACCESS_TOKEN_SECRET": "token_secret",
        }
        with patch.dict("os.environ", env, clear=False):
            from src.sentinel.x_api import XAPI
            api = XAPI()
            assert api._load_credentials() is True

    @patch("src.sentinel.x_api.SovereignHUD")
    def test_load_credentials_returns_false_when_missing(self, _mock_hud: MagicMock):
        """_load_credentials returns False when env vars are absent."""
        with patch.dict("os.environ", {}, clear=True):
            from src.sentinel.x_api import XAPI
            api = XAPI()
            assert api._load_credentials() is False

    @patch("src.sentinel.x_api.SovereignHUD")
    def test_post_article_simulated_when_unconfigured(self, mock_hud: MagicMock):
        """Unconfigured XAPI simulates post and returns True."""
        with patch.dict("os.environ", {}, clear=True):
            from src.sentinel.x_api import XAPI
            api = XAPI()
            result = api.post_article("Test content")
            assert result is True
            mock_hud.persona_log.assert_any_call("WARN", "X API Credentials not found. Post simulated.")

    @patch("src.sentinel.x_api.SovereignHUD")
    def test_post_article_simulation_mode_when_configured(self, mock_hud: MagicMock):
        """Configured XAPI in SIMULATION_MODE logs simulation, returns True."""
        env = {
            "X_API_KEY": "key",
            "X_API_SECRET": "secret",
            "X_ACCESS_TOKEN": "token",
            "X_ACCESS_TOKEN_SECRET": "token_secret",
        }
        with patch.dict("os.environ", env, clear=False):
            from src.sentinel.x_api import XAPI
            api = XAPI()
            assert api.SIMULATION_MODE is True
            result = api.post_article("Live content")
            assert result is True
            mock_hud.persona_log.assert_any_call(
                "INFO", "[SIMULATION] X API configured but live posting disabled."
            )


# ---------------------------------------------------------------------------
# TaliesinSpoke Tests
# ---------------------------------------------------------------------------

@pytest.fixture
def taliesin_root(tmp_path: Path) -> Path:
    """Creates a minimal project root with .lore/ structure for testing."""
    lore_dir = tmp_path / ".lore"
    lore_dir.mkdir()

    # Create voices directory structure
    voices_dir = lore_dir / "voices"
    voices_dir.mkdir()
    (voices_dir / "article.feature").write_text(
        "Feature: Article Voice\n  Scenario: Technical update\n    Given the bard speaks\n    Then output a tech article\n",
        encoding="utf-8",
    )

    lore_subdir = voices_dir / "lore"
    lore_subdir.mkdir()
    (lore_subdir / "narrator.feature").write_text(
        "Feature: Narrator\n  Scenario: Mythic narration\n    Given the narrator speaks\n    Then output mythic prose\n",
        encoding="utf-8",
    )

    chars_dir = lore_subdir / "characters"
    chars_dir.mkdir()
    (chars_dir / "roan.feature").write_text(
        "Feature: Roan\n  Scenario: Roan speaks\n    Given Roan is present\n    Then he speaks gruffly\n",
        encoding="utf-8",
    )

    # Create writing samples
    (lore_dir / "sample1.txt").write_text("The wind howled across the blasted heath." * 10, encoding="utf-8")
    (lore_dir / "sample2.md").write_text("## Chapter Notes\nRoan approached the gate." * 10, encoding="utf-8")

    # Create dev_journal and memory
    (tmp_path / "dev_journal.qmd").write_text("## 2026-03-05\nForged TALIESIN spoke.", encoding="utf-8")
    (tmp_path / "memory.qmd").write_text("## Patterns\n- BDD Voice Contracts are law.", encoding="utf-8")

    return tmp_path


@patch("src.sentinel.taliesin.XAPI")
@patch("src.sentinel.taliesin.AntigravityUplink")
@patch("src.sentinel.taliesin.SovereignHUD")
def create_spoke(root: Path, mock_hud: MagicMock, mock_uplink_cls: MagicMock, mock_xapi_cls: MagicMock):
    """Helper: creates a TaliesinSpoke with fully mocked externals."""
    from src.sentinel.taliesin import TaliesinSpoke

    mock_uplink = AsyncMock()
    mock_uplink_cls.return_value = mock_uplink
    mock_xapi = MagicMock()
    mock_xapi_cls.return_value = mock_xapi

    spoke = TaliesinSpoke(root)
    return spoke, mock_uplink, mock_xapi, mock_hud


class TestGatherContext:
    """Tests for TaliesinSpoke.gather_context."""

    @pytest.mark.asyncio
    async def test_gather_context_includes_journal_and_memory(self, taliesin_root: Path):
        """Both dev_journal and memory content are pulled into context."""
        spoke, _, _, _ = create_spoke(taliesin_root)
        ctx = await spoke.gather_context()

        assert "DEV JOURNAL SNIPPET" in ctx
        assert "Forged TALIESIN spoke" in ctx
        assert "RECENT MEMORIES" in ctx
        assert "BDD Voice Contracts" in ctx

    @pytest.mark.asyncio
    async def test_gather_context_empty_when_no_files(self, tmp_path: Path):
        """Returns empty string when no journal or memory exists."""
        (tmp_path / ".lore").mkdir()
        spoke, _, _, _ = create_spoke(tmp_path)
        ctx = await spoke.gather_context()
        assert ctx == ""


class TestGeneratePost:
    """Tests for TaliesinSpoke.generate_post."""

    @pytest.mark.asyncio
    async def test_generate_post_article_mode_success(self, taliesin_root: Path):
        """Article mode reads article.feature and returns uplink response."""
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        mock_uplink.send_payload.return_value = {
            "status": "success",
            "data": {"raw": "The forge burned bright today."},
        }

        result = await spoke.generate_post(mode="article")

        assert result == "The forge burned bright today."
        mock_uplink.send_payload.assert_called_once()
        call_args = mock_uplink.send_payload.call_args
        assert "ARTICLE" in call_args[0][0]
        assert "article.feature" not in call_args[0][0]  # Contract content, not filename

    @pytest.mark.asyncio
    async def test_generate_post_story_narrator(self, taliesin_root: Path):
        """Story mode with narrator reads narrator.feature."""
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        mock_uplink.send_payload.return_value = {
            "status": "success",
            "data": {"raw": "From the ancient halls..."},
        }

        result = await spoke.generate_post(mode="story", character="narrator")
        assert result == "From the ancient halls..."

    @pytest.mark.asyncio
    async def test_generate_post_story_character(self, taliesin_root: Path):
        """Story mode with specific character reads character-specific contract."""
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        mock_uplink.send_payload.return_value = {
            "status": "success",
            "data": {"raw": "Roan grunted."},
        }

        result = await spoke.generate_post(mode="story", character="Roan")
        assert result == "Roan grunted."

    @pytest.mark.asyncio
    async def test_generate_post_missing_contract_returns_none(self, taliesin_root: Path):
        """Returns None when the voice contract file does not exist."""
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)

        result = await spoke.generate_post(mode="story", character="nonexistent")
        assert result is None
        mock_uplink.send_payload.assert_not_called()

    @pytest.mark.asyncio
    async def test_generate_post_uplink_failure_returns_none(self, taliesin_root: Path):
        """Returns None when uplink returns non-success."""
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        mock_uplink.send_payload.return_value = {
            "status": "error",
            "message": "Quota exceeded",
        }

        result = await spoke.generate_post(mode="article")
        assert result is None


class TestIngestStyle:
    """Tests for TaliesinSpoke.ingest_style (Gherkin contract update)."""

    @pytest.mark.asyncio
    async def test_ingest_updates_voice_contracts(self, taliesin_root: Path):
        """Uplink returns a Gherkin block → individual .feature files are written."""
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        raw_response = "Feature: Refined Voice\n  Scenario: Draft\n"
        mock_uplink.send_payload.return_value = {
            "status": "success",
            "data": {"raw": raw_response},
        }

        result = await spoke.ingest_style()

        assert result is True
        voices_dir = spoke.lore_dir / "voices"
        article = voices_dir / "article.feature"
        narrator = voices_dir / "lore" / "narrator.feature"
        assert article.exists()
        assert narrator.exists()
        
        # Both files get the mocked return value
        assert "Feature: Refined Voice" in article.read_text(encoding="utf-8")
        assert "Feature: Refined Voice" in narrator.read_text(encoding="utf-8")
        assert mock_uplink.send_payload.call_count >= 2

    @pytest.mark.asyncio
    async def test_ingest_strips_markdown_fences(self, taliesin_root: Path):
        """Markdown code fences around Gherkin blocks are stripped."""
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        raw_response = "```gherkin\nFeature: Clean Article\n```\n"
        mock_uplink.send_payload.return_value = {
            "status": "success",
            "data": {"raw": raw_response},
        }

        result = await spoke.ingest_style()

        assert result is True
        content = (spoke.lore_dir / "voices" / "article.feature").read_text(encoding="utf-8")
        assert not content.startswith("```")
        assert "Feature: Clean Article" in content

    @pytest.mark.asyncio
    async def test_ingest_backs_up_existing_contracts(self, taliesin_root: Path):
        """Existing contracts get a .bak backup before being overwritten."""
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        original_article = (spoke.lore_dir / "voices" / "article.feature")
        original_content = original_article.read_text(encoding="utf-8")

        mock_uplink.send_payload.return_value = {
            "status": "success",
            "data": {"raw": "Feature: Updated Article\n"},
        }

        result = await spoke.ingest_style()

        assert result is True
        backup = spoke.lore_dir / "voices" / "article.feature.bak"
        assert backup.exists()
        assert backup.read_text(encoding="utf-8") == original_content

    @pytest.mark.asyncio
    async def test_ingest_empty_corpus_returns_false(self, tmp_path: Path):
        """Empty .lore/ directory returns False."""
        (tmp_path / ".lore").mkdir()
        spoke, _, _, _ = create_spoke(tmp_path)

        result = await spoke.ingest_style()

        assert result is False

    @pytest.mark.asyncio
    async def test_ingest_uplink_failure_returns_false(self, taliesin_root: Path):
        """Uplink failure returns False."""
        spoke, mock_uplink, _, _ = create_spoke(taliesin_root)
        mock_uplink.send_payload.return_value = {
            "status": "error",
            "message": "Service unavailable",
        }

        result = await spoke.ingest_style()

        assert result is False


class TestStagingGateTerminal:
    """Tests for TaliesinSpoke staging gate in terminal mode (no TALIESIN_AGENT_MODE)."""

    def test_staging_gate_approve(self, taliesin_root: Path):
        """User approves → post_article is called."""
        spoke, _, mock_xapi, _ = create_spoke(taliesin_root)
        mock_xapi.post_article.return_value = True

        with patch.dict("os.environ", {}, clear=False), \
             patch("builtins.input", return_value="y"):
            result = spoke.staging_gate("Test draft")

        assert result is True
        mock_xapi.post_article.assert_called_once_with("Test draft")

    def test_staging_gate_reject(self, taliesin_root: Path):
        """User rejects → returns False, no post."""
        spoke, _, mock_xapi, _ = create_spoke(taliesin_root)

        with patch.dict("os.environ", {}, clear=False), \
             patch("builtins.input", return_value="n"):
            result = spoke.staging_gate("Test draft")

        assert result is False
        mock_xapi.post_article.assert_not_called()

    def test_staging_gate_edit_saves_reinforcement(self, taliesin_root: Path):
        """User edits → corrected draft is saved for reinforcement and posted."""
        spoke, _, mock_xapi, _ = create_spoke(taliesin_root)
        mock_xapi.post_article.return_value = True

        inputs = iter(["edit", "Corrected line 1", "Corrected line 2", ""])
        with patch.dict("os.environ", {}, clear=False), \
             patch("builtins.input", side_effect=inputs):
            result = spoke.staging_gate("Original draft")

        assert result is True
        mock_xapi.post_article.assert_called_once_with("Corrected line 1\nCorrected line 2")

        reinforcement_files = list(spoke.lore_dir.glob("reinforcement_*.md"))
        assert len(reinforcement_files) == 1
        content = reinforcement_files[0].read_text(encoding="utf-8")
        assert "Corrected line 1" in content


class TestStagingGateAgent:
    """Tests for TaliesinSpoke staging gate in agent mode (TALIESIN_AGENT_MODE set)."""

    def test_agent_mode_writes_staging_queue(self, taliesin_root: Path):
        """Agent mode writes draft to .lore/staging_queue.json."""
        spoke, _, mock_xapi, _ = create_spoke(taliesin_root)

        with patch.dict("os.environ", {"TALIESIN_AGENT_MODE": "1"}):
            result = spoke.staging_gate("Agent draft")

        assert result is True
        staging_file = spoke.lore_dir / "staging_queue.json"
        assert staging_file.exists()

        payload = json.loads(staging_file.read_text(encoding="utf-8"))
        assert payload["draft"] == "Agent draft"
        assert payload["status"] == "pending_review"
        assert payload["source"] == "taliesin"
        assert "timestamp" in payload
        mock_xapi.post_article.assert_not_called()

    def test_agent_mode_does_not_call_input(self, taliesin_root: Path):
        """Agent mode never calls input()."""
        spoke, _, _, _ = create_spoke(taliesin_root)

        with patch.dict("os.environ", {"TALIESIN_AGENT_MODE": "1"}), \
             patch("builtins.input", side_effect=RuntimeError("input() should not be called")) as mock_input:
            result = spoke.staging_gate("Silent draft")

        assert result is True
