import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from pathlib import Path
from src.core.engine.ravens.score_cohesion import CohesionScorer

@pytest.fixture
def scorer():
    with patch("src.core.engine.ravens.score_cohesion.AntigravityUplink"):
        return CohesionScorer()

def test_lexical_score(scorer):
    gen_text = "The quick brown fox jumps over the lazy dog."
    true_text = "The quick brown fox jumps over the lazy dog."
    score = scorer.lexical_score(gen_text, true_text)
    assert score == 100.0

    gen_text = "The fast brown fox jumps over the lazy dog."
    score = scorer.lexical_score(gen_text, true_text)
    assert 80.0 < score < 100.0

    gen_text = ""
    score = scorer.lexical_score(gen_text, true_text)
    assert score == 0.0

@pytest.mark.asyncio
async def test_intent_score(scorer):
    gen_text = "Some text"
    true_text = "Some other text"
    
    with patch.object(scorer.uplink, "send_payload", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = {
            "status": "success",
            "data": {"raw": "Evaluation result. SCORE: 90/100"}
        }
        
        result = await scorer.intent_score(gen_text, true_text)
        assert "SCORE: 90/100" in result
        mock_send.assert_called_once()

@pytest.mark.asyncio
async def test_run_audit(scorer):
    gen_file = Path("gen.txt")
    true_file = Path("true.txt")
    
    with patch("src.core.engine.ravens.score_cohesion.SovereignHUD"), \
         patch.object(Path, "exists", return_value=True), \
         patch.object(Path, "read_text", return_value="Sample content"), \
         patch.object(scorer, "intent_score", new_callable=AsyncMock) as mock_intent:
        
        mock_intent.return_value = "Evaluation result. SCORE: 90/100"
        
        await scorer.run_audit(gen_file, true_file)
        mock_intent.assert_called_once()

@pytest.mark.asyncio
async def test_run_audit_missing_files(scorer):
    gen_file = Path("gen.txt")
    true_file = Path("true.txt")
    
    with patch("src.core.engine.ravens.score_cohesion.SovereignHUD"), \
         patch.object(Path, "exists", return_value=False):
        
        await scorer.run_audit(gen_file, true_file)
        # Should return early without calling intent_score
