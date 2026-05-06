import pytest
import json
from unittest.mock import MagicMock, patch, AsyncMock
from pathlib import Path
from src.core.engine.ravens.recreate_chapter import RecreateChapterPipeline

@pytest.fixture
def pipeline():
    with patch("src.core.engine.ravens.recreate_chapter.AntigravityUplink"):
        return RecreateChapterPipeline(Path("/tmp/test_root"))

def test_load_world_bible(pipeline):
    with patch.object(Path, "exists", return_value=True), \
         patch.object(Path, "glob", return_value=[Path("lore1.md"), Path("lore2.md")]), \
         patch.object(Path, "read_text", side_effect=["Content 1", "Content 2"]):
        
        bible = pipeline.load_world_bible()
        assert "Content 1" in bible
        assert "Content 2" in bible

def test_load_state(pipeline):
    mock_state = {"chapter": 1}
    with patch.object(Path, "exists", return_value=True), \
         patch.object(Path, "read_text", return_value=json.dumps(mock_state)):
        
        state = pipeline.load_state()
        assert state == mock_state

def test_save_state(pipeline):
    mock_state = {"chapter": 2}
    with patch.object(Path, "write_text") as mock_write:
        pipeline.save_state(mock_state)
        mock_write.assert_called_once()
        assert json.dumps(mock_state, indent=2) in mock_write.call_args[0][0]

@pytest.mark.asyncio
async def test_step_1_director(pipeline):
    with patch.object(pipeline.uplink, "send_payload", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = {"status": "success", "data": {"raw": "1. Step one"}}
        blocking = await pipeline.step_1_director("scene", "details", "end", {})
        assert "Step one" in blocking

@pytest.mark.asyncio
async def test_step_2_characters(pipeline):
    characters = ["Roan", "Nicci"]
    with patch.object(pipeline, "load_character_contract", return_value="Contract"), \
         patch.object(pipeline.uplink, "send_payload", new_callable=AsyncMock) as mock_send:
        
        mock_send.return_value = {"status": "success", "data": {"raw": "Character reaction"}}
        reactions = await pipeline.step_2_characters("blocking", characters)
        
        assert len(reactions) == 2
        assert reactions["Roan"] == "Character reaction"

@pytest.mark.asyncio
async def test_step_3_narrator(pipeline):
    with patch.object(Path, "read_text", return_value="Narrator contract"), \
         patch.object(pipeline.uplink, "send_payload", new_callable=AsyncMock) as mock_send:
        
        mock_send.return_value = {"status": "success", "data": {"raw": "The mythic prose"}}
        prose = await pipeline.step_3_narrator("scene", "blocking", {"Roan": "react"}, "bible")
        assert prose == "The mythic prose"

@pytest.mark.asyncio
async def test_step_4_auditor(pipeline):
    with patch.object(pipeline, "load_character_contract", return_value="Contract"), \
         patch.object(pipeline.uplink, "send_payload", new_callable=AsyncMock) as mock_send:
        
        mock_send.return_value = {"status": "success", "data": {"raw": "PASS"}}
        assert await pipeline.step_4_auditor("prose", ["Roan"]) is True
        
        mock_send.return_value = {"status": "success", "data": {"raw": "FAIL: Reason"}}
        assert await pipeline.step_4_auditor("prose", ["Roan"]) is False

@pytest.mark.asyncio
async def test_step_5_update_state(pipeline):
    with patch.object(pipeline.uplink, "send_payload", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = {"status": "success", "data": {"raw": '{"health": 10}'}}
        new_state = await pipeline.step_5_update_state("prose", {})
        assert new_state == {"health": 10}

@pytest.mark.asyncio
async def test_run_pipeline_success(pipeline):
    with patch("src.core.engine.ravens.recreate_chapter.SovereignHUD"), \
         patch.object(pipeline, "load_world_bible", return_value="bible"), \
         patch.object(pipeline, "load_state", return_value={"chapter": 0}), \
         patch.object(pipeline, "step_1_director", new_callable=AsyncMock, return_value="blocking"), \
         patch.object(pipeline, "step_2_characters", new_callable=AsyncMock, return_value={"Roan": "react"}), \
         patch.object(pipeline, "step_3_narrator", new_callable=AsyncMock, return_value="mythic prose"), \
         patch.object(pipeline, "step_4_auditor", new_callable=AsyncMock, return_value=True), \
         patch.object(pipeline, "step_5_update_state", new_callable=AsyncMock, return_value={"chapter": 1}), \
         patch.object(pipeline, "save_state"), \
         patch.object(Path, "write_text") as mock_write:
        
        await pipeline.run_pipeline("scene", "details", "end", ["Roan"])
        
        assert pipeline.save_state.call_count == 2
        mock_write.assert_called_once_with("mythic prose", encoding='utf-8')
