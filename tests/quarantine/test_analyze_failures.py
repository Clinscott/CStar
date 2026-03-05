import json
from pathlib import Path

from analyze_failures import analyze_benchmarks


def test_analyze_benchmarks_logic(tmp_path, monkeypatch):
    """Verifies that analyze_benchmarks correctly identifies failures."""

    # 1. Create a mock benchmark file
    mock_data = {
        "test_cases": [
            {"query": "start the project", "expected": "/lets-go"},
            {"query": "unknown command", "expected": "/unknown"}
        ]
    }
    mock_file = tmp_path / "mock_fishtest.json"
    mock_file.write_text(json.dumps(mock_data), encoding='utf-8')

    # 2. Mock SovereignVector to return predictable results
    class MockVector:
        def search(self, query):
            if "start" in query:
                return [{"trigger": "/lets-go", "score": 0.95, "note": "exact"}]
            return [{"trigger": "/fallback", "score": 0.5, "note": "low confidence"}]

    monkeypatch.setattr("analyze_failures.SovereignVector", lambda: MockVector())

    # 3. Run analysis
    failures = analyze_benchmarks(mock_file)

    # 4. Assertions
    # One failure expected: "unknown command" -> expected "/unknown", actual "/fallback"
    assert len(failures) == 1
    assert failures[0]["query"] == "unknown command"
    assert failures[0]["expected"] == "/unknown"
    assert failures[0]["actual"] == "/fallback"

def test_analyze_benchmarks_missing_file():
    """Verifies behavior when the source file is missing."""
    results = analyze_benchmarks(Path("non_existent_file.json"))
    assert results == []
