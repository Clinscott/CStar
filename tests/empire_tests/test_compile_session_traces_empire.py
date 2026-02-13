import pytest
from src.tools.compile_session_traces import TraceAnalyzer

def test_trace_analyzer_summary():
    traces = [
        {"query": "test 1", "match": "skill_a", "score": 0.9, "persona": "ALFRED"},
        {"query": "test 2", "match": "skill_b", "score": 0.5, "persona": "ODIN"},
        {"query": "test 3", "match": "skill_a", "score": 0.8, "persona": "ALFRED"}
    ]
    
    analyzer = TraceAnalyzer(traces)
    summary = analyzer.get_summary()
    
    assert summary["total"] == 3
    assert summary["avg_score"] == (0.9 + 0.5 + 0.8) / 3
    assert summary["top_performer"] == "skill_a"
    assert len(summary["critical_fails"]) == 1
    assert summary["critical_fails"][0]["query"] == "test 2"
    assert "ALFRED" in summary["by_persona"]
    assert "ODIN" in summary["by_persona"]

def test_trace_analyzer_empty():
    analyzer = TraceAnalyzer([])
    assert analyzer.get_summary() == {}
