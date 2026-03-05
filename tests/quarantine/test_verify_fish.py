from src.tools.debug.verify_fish import verify_system_integrity


def test_verify_system_integrity(monkeypatch):
    """Verifies that the system verification script runs."""
    # Mocking is already mostly handled in the script's imports for 'google'
    # but we should ensure it doesn't try to actually hit real paths if we can.

    # We patch Muninn to avoid real init logic
    class MockMuninn:
        def __init__(self, root): pass

    monkeypatch.setattr("src.sentinel.muninn.Muninn", MockMuninn)

    # Run verification
    results = verify_system_integrity()
    assert results is True
