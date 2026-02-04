import json
import os
import sys
import threading
import queue
import re

def load_config(root_path: str) -> dict:
    """[ALFRED] Securely load the C* configuration."""
    path = os.path.join(root_path, ".agent", "config.json")
    if not os.path.exists(path): return {}
    try:
        with open(path, 'r', encoding='utf-8') as f: return json.load(f)
    except: return {}

def sanitize_query(text: str) -> str:
    """[ALFRED] Purify user input of shell hazards and noise."""
    if not text: return ""
    clean = re.sub(r'[;&|`$(){}<>\\!]', '', text)
    return " ".join(clean.split())

def input_with_timeout(prompt: str, timeout: int = 30) -> str:
    """[ALFRED] Non-blocking threaded input for responsive shells."""
    print(prompt, end="", flush=True)
    q = queue.Queue()
    
    def _read():
        try: q.put(sys.stdin.readline().strip().lower())
        except EOFError: q.put(None)

    t = threading.Thread(target=_read)
    t.daemon = True
    t.start()
    try: return q.get(block=True, timeout=timeout) or "n"
    except queue.Empty: return "n"
