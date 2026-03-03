import pytest
import asyncio
import time
import os
from pathlib import Path
from unittest.mock import MagicMock, patch
from src.sentinel.muninn import Muninn
from src.sentinel.muninn_heart import MuninnHeart

@pytest.fixture
def mock_root(tmp_path):
    """Creates a temporary repository structure for endurance testing."""
    (tmp_path / "src").mkdir()
    (tmp_path / ".agent").mkdir()
    (tmp_path / "tests" / "gauntlet").mkdir(parents=True)
    return tmp_path

class TestMuninnEndurance:
    """
    [Ω] Muninn Endurance Gauntlet
    Purpose: Verify the Raven's behavior during long-duration autonomous flight.
    """

    @pytest.mark.asyncio
    async def test_endurance_limit_termination(self, mock_root):
        """Verify that Muninn terminates after the endurance limit is reached."""
        with patch('src.cstar.core.uplink.AntigravityUplink'), \
             patch('src.sentinel.muninn_heart.TheWatcher'):
            
            m = Muninn(target_path=str(mock_root))
            # Set start time to 7 hours ago
            m.heart.start_time = time.time() - 25200 
            
            # The cycle should return False immediately due to fatigue
            success = await m.heart.execute_cycle()
            assert success is False

    @pytest.mark.asyncio
    async def test_mission_failure_resilience(self, mock_root):
        """Verify that Muninn survives a mission failure and rolls back correctly."""
        with patch('src.sentinel.muninn_hunter.MuninnHunter.execute_hunt') as mock_hunt, \
             patch('src.sentinel.muninn_crucible.MuninnCrucible.verify_fix', return_value=False), \
             patch('src.sentinel.muninn_crucible.MuninnCrucible.generate_gauntlet', return_value=Path("test.py")), \
             patch('src.sentinel.muninn_crucible.MuninnCrucible.generate_steel', return_value="fixed code"), \
             patch('src.cstar.core.uplink.AntigravityUplink'):
            
            # Mock a breach
            mock_hunt.return_value = ([{"file": "src/broken.py", "action": "fix", "justification": "test"}], {})
            (mock_root / "src" / "broken.py").write_text("orig", encoding='utf-8')
            
            m = Muninn(target_path=str(mock_root))
            os.environ["MUNINN_FORCE_FLIGHT"] = "true"
            
            success = await m.heart.execute_cycle()
            
            assert success is False
            assert m.heart.total_errors == 1
            # Verify rollback (content should be 'orig')
            assert (mock_root / "src" / "broken.py").read_text(encoding='utf-8') == "orig"

    def test_spoke_persistence_reconstruction(self, mock_root):
        """Verify that all spokes are correctly instantiated and cross-linked."""
        with patch('src.cstar.core.uplink.AntigravityUplink'):
            m = Muninn(target_path=str(mock_root))
            assert isinstance(m.heart, MuninnHeart)
            assert m.heart.uplink is not None
            assert m.heart.memory.root == mock_root.resolve()
            assert m.heart.hunter.root == mock_root.resolve()
            assert m.heart.crucible.root == mock_root.resolve()
