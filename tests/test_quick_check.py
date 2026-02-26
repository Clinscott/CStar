from src.tools.debug.quick_check import run_quick_check


def test_run_quick_check_logic(monkeypatch):
    """Verifies that quick_check runs its queries."""
    class MockEngine:
        def __init__(self, **kwargs): pass
        def load_core_skills(self): pass
        def build_index(self): pass
        def search(self, query):
            return [{"trigger": "/mock", "score": 0.8}]

    monkeypatch.setattr("src.tools.debug.quick_check.SovereignVector", MockEngine)

    run_quick_check()
