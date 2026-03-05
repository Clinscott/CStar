from src.tools.debug.debug_perf import run_profile


def test_run_profile_mock(monkeypatch):
    """Verifies that the profiling script runs its loop correctly."""
    # Mock the engine
    class MockEngine:
        def __init__(self, **kwargs):
            self.vocab = []
            self.skills = []
            self.vectors = []
        def load_core_skills(self): pass
        def load_skills_from_dir(self, d, prefix=""): pass
        def build_index(self): pass
        def search(self, query): return []

    monkeypatch.setattr("src.tools.debug.debug_perf.SovereignVector", MockEngine)

    # Run profile (it should print things and finish)
    run_profile()
    # If no crash, it passes.
