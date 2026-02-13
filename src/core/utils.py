import json
import re
import sys
import threading
import queue
from pathlib import Path

def load_config(root_path: str | Path) -> dict:
    """[ALFRED] Securely load the C* configuration using Pathlib."""
    path = Path(root_path) / ".agent" / "config.json"
    return _read_json_file(path)

def _read_json_file(path: Path) -> dict:
    """Internal helper to read and parse JSON safely."""
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, IOError, OSError):
        return {}

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
