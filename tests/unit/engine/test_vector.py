import asyncio
from collections import OrderedDict
from unittest.mock import MagicMock, patch

import pytest

from src.core.engine.vector import SovereignVector


ERROR = "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"


def test_sovereign_vector_search_cache_evicts_oldest_entry(monkeypatch) -> None:
    vector = SovereignVector.__new__(SovereignVector)
    vector.SEARCH_CACHE_MAXSIZE = 2
    vector._search_cache = OrderedDict()
    vector.normalize = lambda text: text.lower()
    vector.corrections = {"phrase_mappings": {}}
    vector.shadow_spoke = MagicMock()
    vector.shadow_spoke.search.return_value = [{"trigger": "shadow", "score": 0.99}]

    asyncio.run(vector.search("alpha"))
    asyncio.run(vector.search("beta"))
    asyncio.run(vector.search("gamma"))

    assert "alpha" not in vector._search_cache
    assert list(vector._search_cache.keys()) == ["beta", "gamma"]


def test_sovereign_vector_search_cache_refreshes_recency_on_hit(monkeypatch) -> None:
    vector = SovereignVector.__new__(SovereignVector)
    vector.SEARCH_CACHE_MAXSIZE = 2
    vector._search_cache = OrderedDict()
    vector.normalize = lambda text: text.lower()
    vector.corrections = {"phrase_mappings": {}}
    vector.shadow_spoke = MagicMock()
    vector.shadow_spoke.search.return_value = [{"trigger": "shadow", "score": 0.99}]

    asyncio.run(vector.search("alpha"))
    asyncio.run(vector.search("beta"))
    asyncio.run(vector.search("alpha"))
    asyncio.run(vector.search("gamma"))

    assert "beta" not in vector._search_cache
    assert list(vector._search_cache.keys()) == ["alpha", "gamma"]


def test_neural_rerank_fails_before_provider_or_temporary_file() -> None:
    vector = SovereignVector.__new__(SovereignVector)
    with patch("tempfile.NamedTemporaryFile") as temporary_file, patch(
        "os.putenv"
    ) as putenv:
        with pytest.raises(RuntimeError, match=f"^{ERROR}$"):
            asyncio.run(vector._neural_rerank("query", [{"trigger": "x"}]))
    temporary_file.assert_not_called()
    putenv.assert_not_called()
