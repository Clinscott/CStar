
import pytest
import yaml

from scripts.validate_phrases import validate_persona_phrases


@pytest.fixture
def mock_phrases_yaml(tmp_path):
    """Creates a temporary valid phrases.yaml file."""
    data = {
        "ODIN": {
            "TASK_FAILED": [
                {"phrase": "The shield shatters. You fail.", "tags": ["harsh"]}
            ]
        },
        "ALFRED": {
            "ERROR_RECOVERY": [
                {"phrase": "A minor setback, sir. I have backups.", "tags": ["polite"]}
            ]
        }
    }
    # Add 'hel' to ODIN to pass validation
    data["ODIN"]["TASK_FAILED"].append({"phrase": "Welcome to Hel.", "tags": ["harsh"]})

    file_path = tmp_path / "phrases.yaml"
    with open(file_path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f)
    return file_path

def test_validate_phrases_valid(mock_phrases_yaml):
    """Verifies that a valid phrase bank passes validation."""
    assert validate_persona_phrases(mock_phrases_yaml) is True

def test_validate_phrases_invalid_odin(tmp_path):
    """Verifies that ODIN missing keywords fails validation."""
    data = {
        "ODIN": {
            "TASK_FAILED": [
                {"phrase": "You fail.", "tags": ["harsh"]}
            ]
        },
        "ALFRED": {
            "ERROR_RECOVERY": [
                {"phrase": "A minor setback, sir. I have backups.", "tags": ["polite"]}
            ]
        }
    }
    file_path = tmp_path / "phrases_invalid.yaml"
    with open(file_path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f)

    assert validate_persona_phrases(file_path) is False

def test_validate_phrases_missing_tags(tmp_path):
    """Verifies that missing tags trigger a warning (and return False if any errors exist)."""
    # Note: the script currently returns False if ANY errors (including warnings) are found.
    data = {
        "ODIN": {
            "TASK_FAILED": [
                {"phrase": "The shield shatters. You fail.", "tags": ["harsh"]},
                {"phrase": "Welcome to Hel.", "tags": []} # Missing tags
            ]
        },
        "ALFRED": {
            "ERROR_RECOVERY": [
                {"phrase": "A minor setback, sir. I have backups.", "tags": ["polite"]}
            ]
        }
    }
    file_path = tmp_path / "phrases_no_tags.yaml"
    with open(file_path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f)

    assert validate_persona_phrases(file_path) is False

def test_validate_phrases_missing_file():
    """Verifies behavior when the file does not exist."""
    assert validate_persona_phrases("non_existent.yaml") is False
