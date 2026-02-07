import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.agent', 'scripts')))

import pytest
import json
from synapse_sync import KnowledgeExtractor

@pytest.fixture
def mock_env(tmp_path):
    project_root = tmp_path
    agent_dir = project_root / ".agent"
    agent_dir.mkdir()
    
    # Config with corrections category
    config = {
        "LearningConfig": {
            "categories": ["corrections", "patterns"]
        }
    }
    with open(agent_dir / "config.json", 'w') as f:
        json.dump(config, f)
        
    # Corrections
    corrections = {
        "fix engine": {"skill": "/lets-go", "score": 1.1, "is_global": False},
        "low score": {"skill": "/run-task", "score": 0.5, "is_global": False},
        "already global": {"skill": "/test", "score": 1.1, "is_global": True}
    }
    with open(agent_dir / "corrections.json", 'w') as f:
        json.dump(corrections, f)
        
    # Processed Traces
    trace_dir = agent_dir / "traces" / "processed"
    trace_dir.mkdir(parents=True)
    for i in range(12):
        with open(trace_dir / f"trace_{i}.json", 'w') as f:
            json.dump({"query": "create a test", "match": "/run-task"}, f)
            
    return project_root

def test_extract_corrections(mock_env):
    extractor = KnowledgeExtractor(str(mock_env), str(mock_env / ".agent"))
    exts = extractor._extract_corrections()
    
    queries = [e["query"] for e in exts]
    assert "fix engine" in queries
    assert "low score" not in queries
    assert "already global" not in queries

def test_extract_patterns(mock_env):
    extractor = KnowledgeExtractor(str(mock_env), str(mock_env / ".agent"))
    exts = extractor._extract_patterns()
    
    patterns = [e["pattern"] for e in exts]
    assert "create a test" in patterns or "create a test" in [e["pattern"] for e in exts]
    # "create a test" is 3 tokens, so 2-grams and 3-grams are: "create a", "a test", "create a test"
    assert any("create a test" in p for p in patterns)

def test_extract_all_unifies(mock_env):
    extractor = KnowledgeExtractor(str(mock_env), str(mock_env / ".agent"))
    all_exts = extractor.extract_all()
    types = [e["type"] for e in all_exts]
    assert "correction" in types
    assert "pattern" in types
