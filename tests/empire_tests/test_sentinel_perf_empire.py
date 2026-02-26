import unittest.mock as mock

from src.tools.sentinel_perf import SentinelPerf


def test_sentinel_perf_metrics():
    # Mock SovereignVector to avoid heavy initialization
    with mock.patch("src.tools.sentinel_perf.SovereignVector") as mock_vector:
        mock_instance = mock_vector.return_value
        mock_instance.search.return_value = []
        mock_instance.tokenize.return_value = []

        perf = SentinelPerf(project_root=".")

        # Test search profiling
        lat = perf.profile_search("test query", iterations=5)
        assert lat >= 0
        assert mock_instance.search.call_count == 5

        # Test tokenization profiling
        t_lat = perf.profile_tokenization("test text", iterations=10)
        assert t_lat >= 0
        assert mock_instance.tokenize.call_count == 10

def test_sentinel_perf_suite():
    with mock.patch("src.tools.sentinel_perf.SovereignVector") as mock_vector:
        perf = SentinelPerf(project_root=".")
        # Just ensure run_suite doesn't crash
        perf.run_suite()
