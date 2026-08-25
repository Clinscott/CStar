import pytest

from src.core.personas import OdinStrategy, PersonaAuthorityBoundaryError


def test_odin_retheme_docs_fails_closed_without_mutating_authority(tmp_path):
    root = tmp_path
    sterile = root / "sterileAgent"
    sterile.mkdir()
    template = sterile / "AGENTS_ODIN.qmd"
    template.write_text("ODIN TEMPLATE", encoding="utf-8")

    strategy = OdinStrategy(str(root))

    with pytest.raises(PersonaAuthorityBoundaryError, match="retheme_docs"):
        strategy.retheme_docs()

    assert not (root / "AGENTS.qmd").exists()
    assert not (root / ".corvus_quarantine").exists()
    assert template.read_text(encoding="utf-8") == "ODIN TEMPLATE"

if __name__ == "__main__":
    # Simple manual check or running via pytest
    import pytest
    pytest.main([__file__])
