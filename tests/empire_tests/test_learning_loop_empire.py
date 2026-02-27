
import os
import sys
import json
import asyncio
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock only external/heavy libraries that might be missing
MOCK_EXTERNALS = [
    "google.genai",
    "google.genai.types",
    "colorama"
]
for mod in MOCK_EXTERNALS:
    sys.modules[mod] = MagicMock()

# [LINKSCOTT STANDARD] Strict Imports
from src.core.sovereign_hud import SovereignHUD
from src.sentinel.muninn import Muninn
from src.core.engine.vector import SovereignVector
from src.tools.user_feedback import log_feedback
from src.cstar.core.forge import Forge
from src.cstar.core.uplink import AntigravityUplink

class TestLearningLoopEmpire:
    """
    [EMPIRE TDD] Comprehensive test suite for the C* Learning & Feedback Infrastructure.
    Ensures all neural and physical loops are closed and verified.
    """

    # --- 1. USER FEEDBACK LOOP TESTS ---

    def test_log_feedback_persistence(self, tmp_path):
        """Ensures user feedback is correctly written to the JSONL ledger."""
        agent_dir = tmp_path / ".agent"
        agent_dir.mkdir()
        feedback_file = agent_dir / "feedback.jsonl"
        
        with patch("src.tools.user_feedback.Path.resolve") as mock_res:
            mock_res.return_value = tmp_path / "src" / "tools" / "user_feedback.py"
            log_feedback(1, "Testing slop", "test_file.py")
            assert feedback_file.exists()
            content = feedback_file.read_text()
            data = json.loads(content)
            assert data["score"] == 1
            assert data["comment"] == "Testing slop"
            assert data["target_file"] == "test_file.py"

    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key"})
    def test_muninn_feedback_prioritization(self, tmp_path):
        """Verifies that Muninn boosts scores for files flagged by the user."""
        feedback_file = tmp_path / ".agent" / "feedback.jsonl"
        feedback_file.parent.mkdir(parents=True, exist_ok=True)
        feedback_file.write_text(json.dumps({"score": 1, "target_file": "flagged.py", "comment": "slop"}) + "\n")
        
        with patch("src.sentinel.muninn.TheWatcher"), \
             patch("src.sentinel.muninn.ProjectMetricsEngine"), \
             patch("src.sentinel.muninn.GungnirSPRT"):
            
            muninn = Muninn(str(tmp_path))
            poor_files = muninn._check_user_feedback()
            assert "flagged.py" in poor_files
            
            # Test score boosting
            breach = {"file": "flagged.py", "severity": "LOW", "type": "STRUCTURAL_BREACH", "action": "Fix slop"}
            all_breaches = [breach]
            
            with patch("src.sentinel.muninn.SovereignHUD.persona_log") as mock_log:
                target = muninn._select_target_phase(all_breaches)
                found_boost_log = False
                for call in mock_log.call_args_list:
                    if "User Feedback Boost applied to flagged.py" in str(call):
                        found_boost_log = True
                        break
                assert found_boost_log

    # --- 2. BRAVE SEARCH INTEGRATION TESTS ---

    @pytest.mark.asyncio
    @patch("src.cstar.core.forge.BraveSearch")
    @patch("src.cstar.core.forge.AntigravityUplink")
    async def test_forge_brave_integration(self, mock_uplink_class, mock_brave, tmp_path):
        """Ensures Forge scries the web for documentation on complex tasks."""
        # Setup AsyncMock for send_payload
        mock_uplink_inst = mock_uplink_class.return_value
        mock_uplink_inst.send_payload = AsyncMock(return_value={"status": "success", "code": "print('ok')"})
        
        with patch("src.core.sovereign_hud.SovereignHUD.persona_log"):
            forge = Forge()
            mock_searcher = mock_brave.return_value
            mock_searcher.search.return_value = [{"title": "Docs", "description": "How to use X", "url": "http://x.com"}]
            
            task = "Implement a complex FastAPI endpoint with OAuth2"
            context = {}
            
            await forge._generate_with_calculus(task, context, ".py")
            assert mock_searcher.search.called
            assert "web_research" in context
            assert "How to use X" in context["web_research"]

    @pytest.mark.asyncio
    @patch("src.cstar.core.uplink.BraveSearch")
    async def test_uplink_search_augmentation(self, mock_brave):
        """Verifies AntigravityUplink can augment payloads with live research."""
        uplink = AntigravityUplink(api_key="fake")
        mock_searcher = mock_brave.return_value
        mock_searcher.search.return_value = [{"title": "Web Info", "description": "Found data", "url": "http://info.com"}]
        
        context = {}
        with patch.object(uplink, "_transmit_with_backoff", return_value={"status": "success"}), \
             patch.object(uplink, "_spinner", side_effect=lambda task, msg: task), \
             patch("src.core.sovereign_hud.SovereignHUD.persona_log"):
            
            await uplink.send_payload("Search query", context, search_augment=True)
            assert mock_searcher.search.called
            assert "web_research" in context
            assert "Found data" in context["web_research"]

    # --- 3. SYSTEM LEARNING LOOP TESTS ---

    @patch("src.core.sv_engine.compile_traces")
    def test_sv_engine_teardown_learning(self, mock_compile, tmp_path):
        """Ensures SovereignEngine triggers trace compilation on teardown."""
        agent_dir = tmp_path / ".agent"
        agent_dir.mkdir()
        (agent_dir / "config.json").write_text(json.dumps({"system": {"persona": "ALFRED"}}))
        
        with patch("src.core.engine.vector.MemoryDB"), \
             patch("src.core.engine.vector.InstructionLoader"), \
             patch("src.core.engine.vector.SovereignVector._load_thesaurus", return_value={}):
            
            from src.core.sv_engine import SovereignEngine
            engine = SovereignEngine(project_root=tmp_path)
            with patch("src.core.sv_engine.SovereignHUD.persona_log"):
                engine.teardown()
                assert mock_compile.called

    def test_persistent_thesaurus_update(self, tmp_path):
        """Verifies that proactive lexicon expansion updates thesaurus.qmd persistently."""
        src_data = tmp_path / "src" / "data"
        src_data.mkdir(parents=True)
        thesaurus_file = src_data / "thesaurus.qmd"
        thesaurus_file.write_text("# Thesaurus\n")
        
        agent_dir = tmp_path / ".agent"
        agent_dir.mkdir()
        (agent_dir / "config.json").write_text(json.dumps({"system": {"persona": "ALFRED"}}))

        with patch("src.core.engine.vector.MemoryDB"), \
             patch("src.core.engine.vector.InstructionLoader"), \
             patch("src.core.sv_engine.BraveSearch") as mock_brave, \
             patch("src.core.sv_engine.Cortex"):
            
            from src.core.sv_engine import SovereignEngine
            engine = SovereignEngine(project_root=tmp_path)
            
            mock_searcher = mock_brave.return_value
            mock_searcher.search.return_value = [{"description": "New technical definition"}]
            
            mock_vector = MagicMock()
            mock_vector.vocab = []
            mock_vector.stopwords = []
            
            with patch("src.core.sv_engine.SovereignHUD.persona_log"):
                # Use query that IS the term to ensure it's selected as target
                engine._proactive_lexicon_lift("quantum_flux", mock_vector)
                
                updated_content = thesaurus_file.read_text()
                assert "**quantum_flux**" in updated_content
                assert "New technical definition" in updated_content

if __name__ == "__main__":
    pytest.main([__file__])
