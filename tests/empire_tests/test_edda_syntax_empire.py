import pytest
from pathlib import Path
from src.core.edda import EddaWeaver

def test_edda_syntax_conversion():
    """
    Verifies that EddaWeaver correctly converts legacy blockquotes to alerts.
    """
    # Create weaver (directories don't need to exist for unit testing the logic)
    weaver = EddaWeaver(Path("."), Path("/tmp/quarantine"))
    
    cases = [
        ("> Note: This is an observation", "> [!NOTE]\n> This is an observation"),
        ("> Warning: This is dangerous", "> [!WARNING]\n> This is dangerous"),
        ("> Important: This is critical", "> [!IMPORTANT]\n> This is critical"),
        ("> This is a general note", "> [!NOTE]\n> This is a general note"),
        ("> There is a note here", "> [!NOTE]\n> There is a note here")
    ]
    
    for legacy, expected in cases:
        result = weaver._convert_syntax(legacy)
        assert result.strip() == expected.strip(), f"Failed to convert: {legacy}"

def test_edda_syntax_multiline():
    """
    Verifies multiline content handles alerts correctly.
    """
    weaver = EddaWeaver(Path("."), Path("/tmp/quarantine"))
    
    legacy = "# Title\n\n> Note: Block 1\n\nNormal text\n\n> Warning: Block 2"
    expected = "# Title\n\n> [!NOTE]\n> Block 1\n\nNormal text\n\n> [!WARNING]\n> Block 2"
    
    result = weaver._convert_syntax(legacy)
    assert result == expected
