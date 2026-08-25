import pytest

from src.synapse.synapse_sync import (
    RETIRED_ERROR,
    GitHelper,
    KnowledgeExtractor,
    PushRateLimiter,
    Synapse,
)


def test_file_backed_rate_limiter_is_inert(tmp_path):
    limiter = PushRateLimiter(tmp_path)
    assert limiter.check() == (False, RETIRED_ERROR)
    with pytest.raises(RuntimeError, match=RETIRED_ERROR):
        limiter.record(success=True)
    assert list(tmp_path.iterdir()) == []


def test_git_and_knowledge_surfaces_fail_closed(tmp_path):
    assert GitHelper(tmp_path).run(["status"]) == (False, RETIRED_ERROR)
    assert GitHelper(tmp_path).check_permissions() == (False, RETIRED_ERROR)
    extractor = KnowledgeExtractor(tmp_path, tmp_path / "agents")
    assert extractor.extract_all() == []
    assert list(tmp_path.iterdir()) == []


def test_synapse_push_and_pull_are_retired(tmp_path):
    synapse = Synapse("synthetic")
    with pytest.raises(RuntimeError, match=RETIRED_ERROR):
        synapse.pull()
    with pytest.raises(RuntimeError, match=RETIRED_ERROR):
        synapse.push(dry_run=True)
    assert list(tmp_path.iterdir()) == []
