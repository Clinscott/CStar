import json

from src.tools.debug.debug_fishtest_phase2 import run_debug_phase2


def test_run_debug_phase2_logic(tmp_path, monkeypatch):
    """Verifies that the phase 2 debug script correctly processes test cases."""
    # 1. Mock the engine
    class MockEngine:
        def __init__(self, **kwargs): pass
        def search(self, query):
            if "resume" in query:
                return [{"trigger": "/lets-go", "score": 0.85}]
            return [{"trigger": "/unknown", "score": 0.4}]
        def load_core_skills(self): pass
        def load_skills_from_dir(self, d, prefix=""): pass
        def build_index(self): pass

    monkeypatch.setattr("src.tools.debug.debug_fishtest_phase2.SovereignVector", MockEngine)

    # 2. Mock the data file
    mock_data = {
        "test_cases": [
            {"query": "resume work", "expected": "/lets-go"},
            {"query": "fail", "expected": "/pass"}
        ]
    }
    data_file = tmp_path / "fishtest_phase2_data.json"
    data_file.write_text(json.dumps(mock_data), encoding='utf-8')

    # 3. Run and check results
    passed, total = run_debug_phase2(str(data_file))

    assert passed == 1
    assert total == 2
