import pytest
import sys
import textwrap
import time
from pathlib import Path
from src.core.engine.autobot_skill import HermesSessionRunner, HardTimeoutError, ReadyPromptTimeoutError, ProcessExitedError

def test_pty_runner_success(tmp_path):
    # A mock process that prints a prompt, waits for input, then prints DONE
    worker_code = textwrap.dedent("""\
        import sys
        import time
        sys.stdout.write("❯ ")
        sys.stdout.flush()
        line = sys.stdin.readline()
        if "PROMPT" in line:
            sys.stdout.write("Working...\\n")
            sys.stdout.flush()
            time.sleep(0.1)
            sys.stdout.write("AUTOBOT_DONE\\n")
            sys.stdout.flush()
    """)

    runner = HermesSessionRunner(
        command=[sys.executable, "-u", "-c", worker_code],
        working_dir=tmp_path,
        ready_regex=r"❯\s*$",
        timeout_seconds=5.0,
        startup_timeout_seconds=2.0,
        grace_seconds=1.0,
        stream_output=False
    )

    result = runner.run("PROMPT", done_regexes=[r"AUTOBOT_DONE"])

    assert result.success is True
    assert "matched completion pattern" in result.reason
    assert result.matched_pattern == r"AUTOBOT_DONE"

def test_pty_runner_startup_timeout(tmp_path):
    # A mock process that never prints the prompt
    worker_code = "import time; time.sleep(10)"

    runner = HermesSessionRunner(
        command=[sys.executable, "-u", "-c", worker_code],
        working_dir=tmp_path,
        ready_regex=r"❯\s*$",
        timeout_seconds=5.0,
        startup_timeout_seconds=0.5,
        grace_seconds=1.0,
        stream_output=False
    )

    with pytest.raises(ReadyPromptTimeoutError):
        runner.run("PROMPT", done_regexes=[r"AUTOBOT_DONE"])

def test_pty_runner_hard_timeout(tmp_path):
    # A mock process that reaches prompt but hangs after input
    worker_code = textwrap.dedent("""\
        import sys
        import time
        sys.stdout.write("❯ ")
        sys.stdout.flush()
        sys.stdin.readline()
        time.sleep(10)
    """)

    runner = HermesSessionRunner(
        command=[sys.executable, "-u", "-c", worker_code],
        working_dir=tmp_path,
        ready_regex=r"❯\s*$",
        timeout_seconds=0.5,
        startup_timeout_seconds=2.0,
        grace_seconds=1.0,
        stream_output=False
    )

    with pytest.raises(HardTimeoutError):
        runner.run("PROMPT", done_regexes=[r"AUTOBOT_DONE"])

def test_pty_runner_exit_early(tmp_path):
    # A mock process that exits immediately after input without completion marker
    worker_code = textwrap.dedent("""\
        import sys
        sys.stdout.write("❯ ")
        sys.stdout.flush()
        sys.stdin.readline()
        sys.exit(1)
    """)

    runner = HermesSessionRunner(
        command=[sys.executable, "-u", "-c", worker_code],
        working_dir=tmp_path,
        ready_regex=r"❯\s*$",
        timeout_seconds=5.0,
        startup_timeout_seconds=2.0,
        grace_seconds=1.0,
        stream_output=False
    )

    with pytest.raises(ProcessExitedError):
        runner.run("PROMPT", done_regexes=[r"AUTOBOT_DONE"])
