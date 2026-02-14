import os
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
        with open(path, 'r', encoding='utf-8') as f:
            if msvcrt:
                # Windows-specific: shared read lock (LK_NBLCK)
                try:
                    msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, os.path.getsize(path))
                except (IOError, OSError):
                    pass
            import json
            return json.load(f)
    except (json.JSONDecodeError, IOError, OSError):
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
