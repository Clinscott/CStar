from src.core.edda import EddaWeaver


def test_edda_markup_parsers_remain_detached():
    assert EddaWeaver._extract_title("# Test Title\nBody") == "Test Title"
    assert EddaWeaver._convert_syntax("> Warning: Danger") == "> [!WARNING]\n> Danger"
    assert EddaWeaver._convert_syntax("> General") == "> [!NOTE]\n> General"
