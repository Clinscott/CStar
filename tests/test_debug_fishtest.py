import json

from src.tools.debug.debug_fishtest import run_debug_fishtest


def test_run_debug_fishtest_logic(tmp_path, monkeypatch):
    """Verifies that the debug fishtest script correctly processes test cases."""
    # 1. Mock the engine to avoid real heavy initialization
    class MockEngine:
        def __init__(self, **kwargs):
            self.thesaurus_path = kwargs.get('thesaurus_path')

        def search(self, query):
            if "start" in query:
                return [{"trigger": "/lets-go", "score": 0.9}]
            return [{"trigger": "/unknown", "score": 0.5}]

        def load_core_skills(self): pass
        def load_skills_from_dir(self, d, prefix=""): pass
        def build_index(self): pass

    monkeypatch.setattr("src.tools.debug.debug_fishtest.SovereignVector", MockEngine)

    # 2. Create a mock data file
    mock_data = {
        "test_cases": [
            {"query": "start the project", "expected": "/lets-go"},
            {"query": "wrong", "expected": "/right"}
        ]
    }
    data_file = tmp_path / "mock_fishtest_data.json"
    data_file.write_text(json.dumps(mock_data), encoding='utf-8')

    # 3. Run and check results (pass the mock file path)
    passed, total = run_debug_fishtest(str(data_file))

    assert passed == 1
    assert total == 2

def test_run_debug_fishtest_missing_file():
    """Verifies behavior when the data file is missing."""
    passed, total = run_debug_fishtest("non_existent_data.json")
    assert passed == 0
    assert total == 0
