import json

from src.synapse.synapse_sync import KnowledgeExtractor, PushRateLimiter


def test_push_rate_limiter(tmp_path):
    # Setup core path
    core_path = tmp_path / "core"
    core_path.mkdir()

    limiter = PushRateLimiter(core_path)

    # Recording 11 pushes should trigger limit
    for _ in range(11):
        limiter.record(success=True)

    ok, msg = limiter.check()
    assert ok is False
    assert "Rate limit exceeded" in msg

def test_knowledge_extractor_corrections(tmp_path):
    agent_dir = tmp_path / "agent"
    agent_dir.mkdir()
    corrections_file = agent_dir / "corrections.json"
    corrections_file.write_text(json.dumps({
        "phrase_mappings": {
            "test_query": "test_target",
            "ignore_me": "GLOBAL:something"
        }
    }), encoding='utf-8')

    extractor = KnowledgeExtractor(tmp_path, agent_dir)
    knowledge = extractor._extract_corrections()

    assert len(knowledge) == 1
    assert knowledge[0]["query"] == "test_query"
    assert knowledge[0]["target"] == "test_target"
