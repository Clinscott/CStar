from src.core.personas import OdinStrategy


def test_odin_retheme_docs_creates_dir(tmp_path):
    strategy = OdinStrategy(str(tmp_path))

    results = strategy.retheme_docs()

    assert results == []
    assert list(tmp_path.iterdir()) == []

if __name__ == "__main__":
    # Simple manual check or running via pytest
    import pytest
    pytest.main([__file__])
