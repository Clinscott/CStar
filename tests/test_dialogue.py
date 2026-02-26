
import pytest

from src.core.engine.dialogue import DialogueEngine


@pytest.fixture
def mock_phrases_file(tmp_path):
    """Creates a mock phrases YAML file."""
    content = """
ODIN:
  GREETING:
    - phrase: "I am ODIN."
      tags: ["intro"]
    - phrase: "Silence!"
      tags: ["harsh"]
ALFRED:
  GREETING:
    - phrase: "Hello, sir."
      tags: ["polite"]
"""
    p = tmp_path / "phrases.yaml"
    p.write_text(content, encoding='utf-8')
    return p

def test_dialogue_engine_get(mock_phrases_file):
    """Verifies phrase retrieval."""
    engine = DialogueEngine(mock_phrases_file)

    phrase = engine.get("ODIN", "GREETING")
    assert phrase in ["I am ODIN.", "Silence!"]

    phrase_alfred = engine.get("ALFRED", "GREETING")
    assert phrase_alfred == "Hello, sir."

def test_dialogue_engine_scoring(mock_phrases_file):
    """Verifies tag-based scoring."""
    engine = DialogueEngine(mock_phrases_file)

    # Force a context that favors "Silence!"
    context = {"compliance_breach": True}
    # Note: "Silence!" doesn't have "shatters" or "hel" but scoring logic adds 10 if words match
    # I should use words that are in the scoring logic for a better test.

    content = """
ODIN:
  TASK_FAILED:
    - phrase: "The shield shatters."
      tags: ["compliance_breach"]
    - phrase: "A minor error."
      tags: ["low_severity"]
"""
    mock_phrases_file.write_text(content, encoding='utf-8')
    engine = DialogueEngine(mock_phrases_file)

    phrase = engine.get("ODIN", "TASK_FAILED", context={"compliance_breach": True})
    assert phrase == "The shield shatters."
