import contextlib
import json
import os
import queue
import re
import sys
import threading
from pathlib import Path

try:
    import msvcrt
except ImportError:
    msvcrt = None

def load_config(root_path: str | Path) -> dict:
    """[ALFRED] Securely load the C* configuration using Pathlib."""
    path = Path(root_path) / ".agent" / "config.json"
    return safe_read_json(path)

def safe_read_json(path: Path | str) -> dict:
    """[ALFRED] Thread-safe and Windows-safe JSON reader with shared locks."""
    path = Path(path)
    if not path.exists():
        return {}

    try:
        with open(path, encoding='utf-8') as f:
            if msvcrt:
                # Windows-specific: shared read lock (LK_NBLCK)
                with contextlib.suppress(OSError):
                    msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, os.path.getsize(path))
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}

def _read_json_file(path: Path) -> dict:
    """Internal helper for legacy compatibility. Prefer safe_read_json."""
    return safe_read_json(path)

def sanitize_query(text: str) -> str:
    """[ALFRED] Purify user input of shell hazards and noise."""
    if not text: return ""
    clean = re.sub(r'[;&|`$(){}<>\\!]', '', text)
    return " ".join(clean.split())

def input_with_timeout(prompt: str, timeout: int = 30) -> str:
    """[ALFRED] Non-blocking threaded input for responsive shells."""
    print(prompt, end="", flush=True)
    q = queue.Queue()

    def _read() -> None:
        """Reads one line from sys.stdin and puts it into the queue."""
        try: q.put(sys.stdin.readline().strip().lower())
        except EOFError: q.put(None)

    t = threading.Thread(target=_read)
    t.daemon = True
    t.start()
    try: return q.get(block=True, timeout=timeout) or "n"
    except queue.Empty: return "n"

def atomic_jsonl_append(path: Path | str, data: dict) -> bool:
    """
    [V4] Appends a JSON-serialized dict to a .jsonl file.
    Atomic on most POSIX systems and resilient on Windows via simple append.
    """
    path = Path(path)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data) + "\n")
        return True
    except Exception:
        return False
