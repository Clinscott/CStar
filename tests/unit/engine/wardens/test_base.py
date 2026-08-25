from pathlib import Path

import pytest

from src.core.engine.wardens.base import BaseWarden


class ConcreteWarden(BaseWarden):
    def scan(self):
        return []


@pytest.fixture
def warden():
    return ConcreteWarden(Path("/tmp/root"))


def test_warden_has_no_config_provider_or_secret_state(warden):
    assert not hasattr(warden, "_load_config")
    assert not hasattr(warden, "brave")
    assert [name for name in vars(warden) if "config" in name.lower()] == []


def test_should_ignore(warden):
    assert warden._should_ignore(Path("/tmp/root/.git")) is True
    assert warden._should_ignore(Path("/tmp/root/node_modules/lib")) is True
    assert warden._should_ignore(Path("/tmp/root/src/main.py")) is False


def test_research_topic_is_retired_before_provider_access(warden):
    with pytest.raises(RuntimeError, match="warden_research_retired_use_cstar_researcher_request"):
        warden.research_topic("something")


@pytest.mark.asyncio
async def test_scan_async(warden, monkeypatch):
    called = []
    monkeypatch.setattr(warden, "scan", lambda: called.append(True) or [{"type": "TEST"}])
    assert await warden.scan_async() == [{"type": "TEST"}]
    assert called == [True]


@pytest.mark.asyncio
async def test_propose_evolution_is_pure_metadata(warden, monkeypatch):
    monkeypatch.setattr("inspect.getfile", lambda _target: "test_base.py")
    evolution = await warden.propose_evolution("Too slow")
    assert evolution["type"] == "WARDEN_EVOLUTION"
    assert evolution["severity"] == "CRITICAL"
    assert "EVOLVE: Too slow" in evolution["action"]
