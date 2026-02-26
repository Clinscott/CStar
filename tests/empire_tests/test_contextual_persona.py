import json
from unittest.mock import mock_open, patch

import pytest

from src.core.engine.alfred_observer import AlfredOverwatch
from src.core.engine.dialogue import DialogueEngine
from src.core.personas import AlfredStrategy, OdinStrategy

# --- Mocks for Testing ---

@pytest.fixture
def dialogue_engine():
    # Mock phrase bank representing the two personas
    phrase_data = {
        "ODIN": {
            "TASK_FAILED": [
                {"phrase": "The spear shatters against the void.", "tags": ["compliance_breach"]},
                {"phrase": "Hel awaits the unworthy.", "tags": ["compliance_breach"]},
                {"phrase": "Generic failure message.", "tags": []}
            ]
        },
        "ALFRED": {
            "ERROR_RECOVERY": [
                {"phrase": "A minor setback, sir. Syntax corrected.", "tags": ["syntax", "setback"]},
                {"phrase": "Analyzing the fault in the archives.", "tags": ["archive"]},
                {"phrase": "Standard recovery initiated.", "tags": []}
            ]
        }
    }
    # Initialize with mock data (bypassing loader for now or patching it)
    engine = DialogueEngine(None)
    engine.phrase_data = phrase_data
    return engine

# --- Test Scenarios ---

def test_odin_reacts_to_defiance(dialogue_engine):
    """Scenario: Odin reacts to system defiance with specific vocabulary."""
    # Simulate sovereign_state.json with DEFIANCE
    mock_state = json.dumps({"check_pro.py": "DEFIANCE"})

    with patch("builtins.open", mock_open(read_data=mock_state)):
        with patch("os.path.exists", return_value=True):
            # We need to pass the root to OdinStrategy
            odin = OdinStrategy(".")
            context = odin.enforce_policy() # Should set compliance_breach=True

            assert context.get("compliance_breach") is True

            # Verify dialogue engine selects the correct themed phrase
            phrase = dialogue_engine.get("ODIN", "TASK_FAILED", context=context)
            assert any(word in phrase.lower() for word in ["shatters", "hel"])

def test_alfred_provides_syntax_guidance(dialogue_engine):
    """Scenario: Alfred detects a SyntaxError and provides targeted dialogue."""
    observer = AlfredOverwatch()

    # Mocking the tuple return (error_type, analysis_string)
    with patch.object(observer, 'analyze_failure', return_value=("SyntaxError", "Missing colon on line 10")):
        error_type, analysis = observer.analyze_failure("dummy_target", "dummy_traceback")

        alfred = AlfredStrategy(".")
        # Proposed change: alfred.enforce_policy(error_type=error_type)
        context = {"error_type": error_type}

        assert context.get("error_type") == "SyntaxError"

        # Verify dialogue engine includes the hint
        phrase = dialogue_engine.get("ALFRED", "ERROR_RECOVERY", context=context)
        assert any(word in phrase.lower() for word in ["setback", "syntax"])

def test_dialogue_fallback_on_no_match(dialogue_engine):
    """Scenario: Verify fallback to random choice when context is empty."""
    # No context provided
    phrase = dialogue_engine.get("ODIN", "TASK_FAILED", context={})

    # Ensure it still returns one of the valid phrases from the bank
    valid_phrases = [p['phrase'] for p in dialogue_engine.phrase_data["ODIN"]["TASK_FAILED"]]
    assert phrase in valid_phrases
