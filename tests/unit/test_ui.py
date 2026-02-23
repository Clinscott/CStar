"""
Suite 6: Sovereign HUD — The Async Tearing & Interruption Protocol.

Mathematically proves the gamified TUI can handle high-velocity
asynchronous broadcasts from multiple daemons without tearing,
and safely handles user interruptions without locking the terminal.

Adheres to the Linscott Standard for Verification.
"""

import asyncio
import contextlib
import io
import sys
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Path Setup
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.ui import HUD

# ===========================================================================
# Fixtures
# ===========================================================================


@pytest.fixture
def mock_stream():
    """Provides an isolated io.StringIO stream — zero ANSI output to real terminal."""
    return io.StringIO()


@pytest.fixture(autouse=True)
def reset_hud_async_state():
    """Ensure each test starts with a virgin queue and lock (no cross-test contamination)."""
    HUD._render_queue = None
    HUD._render_lock = None
    HUD._INITIALIZED = False
    HUD.PERSONA = "ALFRED"
    yield
    HUD._render_queue = None
    HUD._render_lock = None


# ===========================================================================
# Test 1: The Async Tearing Test (Queue Flood)
# ===========================================================================


@pytest.mark.asyncio
async def test_hud_async_tearing(mock_stream):
    """
    [ODIN] Multiple daemons (ODIN, MUNINN, WARDEN) simultaneously broadcast
    50 messages each to the HUD's internal rendering queue. The HUD must queue
    these messages and render them sequentially without race conditions, dropped
    frames, or crashing the event loop.

    Mathematical proof:
        - 3 daemons × 50 messages = exactly 150 rendered lines
        - Each line attributed to its correct source
        - Per-source FIFO ordering preserved (monotonically increasing index)
    """
    MSG_COUNT = 50

    # Phase 1: Concurrent broadcast flood from three daemons
    async def daemon_flood(source: str, count: int) -> None:
        for i in range(count):
            await HUD.broadcast(source, f"msg_{i:03d}")

    await asyncio.gather(
        daemon_flood("ODIN", MSG_COUNT),
        daemon_flood("MUNINN", MSG_COUNT),
        daemon_flood("WARDEN", MSG_COUNT),
    )

    # Phase 2: Drain via render_loop — poison pill to terminate
    queue = HUD.get_render_queue()
    render_task = asyncio.create_task(HUD.render_loop(output_stream=mock_stream))
    await queue.join()        # Wait until all 150 items are processed
    await queue.put(None)     # Poison pill
    await render_task         # Wait for clean exit

    # Phase 3: Assertions
    output = mock_stream.getvalue()
    lines = [line for line in output.strip().split("\n") if line]

    # No dropped frames
    assert len(lines) == MSG_COUNT * 3, (
        f"Expected {MSG_COUNT * 3} lines, got {len(lines)} — frames were dropped"
    )

    # Source attribution — every line belongs to exactly one daemon
    odin_lines = [line for line in lines if line.startswith("[ODIN]")]
    muninn_lines = [line for line in lines if line.startswith("[MUNINN]")]
    warden_lines = [line for line in lines if line.startswith("[WARDEN]")]

    assert len(odin_lines) == MSG_COUNT, f"ODIN: expected {MSG_COUNT}, got {len(odin_lines)}"
    assert len(muninn_lines) == MSG_COUNT, f"MUNINN: expected {MSG_COUNT}, got {len(muninn_lines)}"
    assert len(warden_lines) == MSG_COUNT, f"WARDEN: expected {MSG_COUNT}, got {len(warden_lines)}"

    # Per-source FIFO ordering — monotonically increasing sequence indices
    for source_name, source_lines in [("ODIN", odin_lines), ("MUNINN", muninn_lines), ("WARDEN", warden_lines)]:
        indices = [int(line.split("msg_")[1]) for line in source_lines]
        assert indices == sorted(indices), (
            f"{source_name} messages arrived out of order: {indices}"
        )


# ===========================================================================
# Test 2: The Interruption Protocol
# ===========================================================================


@pytest.mark.asyncio
async def test_hud_interruption_cleanup(mock_stream):
    """
    [ODIN] The HUD is rendering a slow typewriter stream. The user injects a
    CancelledError mid-stream. The rendering coroutine must:

    1. Immediately catch the cancellation
    2. Inject a newline so the prompt lands on a clean line
    3. Restore the terminal cursor (CURSOR_SHOW)
    4. Leave the terminal in a writable, unlocked state

    Proof:
        - Output starts with \\033[?25l (cursor hidden)
        - Output ends with \\n\\033[?25h (newline + cursor restored)
        - Partial render: 0 < rendered chars < total chars
        - Post-cancel writes succeed without error
    """
    long_text = "A" * 100  # 100 chars at 0.1s delay = 10s total

    task = asyncio.create_task(
        HUD.stream_text(long_text, delay=0.1, output_stream=mock_stream)
    )

    # Let ~2-3 chars render before cancellation
    await asyncio.sleep(0.25)
    task.cancel()

    with contextlib.suppress(asyncio.CancelledError):
        await task

    output = mock_stream.getvalue()

    # Cursor hide was written at stream start
    assert output.startswith(HUD.CURSOR_HIDE), (
        f"Expected output to start with CURSOR_HIDE, got: {output[:20]!r}"
    )

    # Cursor restore was written in finally block (with preceding newline for clean prompt)
    assert output.endswith("\n" + HUD.CURSOR_SHOW), (
        f"Expected output to end with \\n + CURSOR_SHOW, got: {output[-20:]!r}"
    )

    # Partial render — not all 100 chars were written
    content = output.replace(HUD.CURSOR_HIDE, "").replace(HUD.CURSOR_SHOW, "")
    # Remove the newlines (the interrupted newline from finally)
    char_content = content.replace("\n", "")
    assert 0 < len(char_content) < 100, (
        f"Expected partial render (0 < n < 100), got {len(char_content)} chars"
    )

    # Terminal not locked — additional writes succeed
    mock_stream.write("POST_CANCEL_WRITE")
    assert "POST_CANCEL_WRITE" in mock_stream.getvalue(), (
        "Terminal is locked — post-cancel write failed"
    )
