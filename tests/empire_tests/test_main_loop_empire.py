import signal

from src.sentinel.main_loop import ShutdownHandler, highlander_check


def test_shutdown_handler():
    handler = ShutdownHandler()
    assert handler.active is True
    # Simulate signal
    handler.shutdown(signal.SIGINT, None)
    assert handler.active is False

def test_highlander_check(tmp_path):
    lock_file = tmp_path / "ravens.lock"
    # No lock file
    assert highlander_check(lock_file) is False

    # Create lock file with current PID
    import os
    lock_file.write_text(str(os.getpid()), encoding='utf-8')
    assert highlander_check(lock_file) is True

    # Create lock file with fake PID
    lock_file.write_text("999999", encoding='utf-8')
    # Use psutil to check if it exists (highly unlikely 999999 exists on most systems)
    import psutil
    if not psutil.pid_exists(999999):
        assert highlander_check(lock_file) is True # It returns True if pid doesn't exist
