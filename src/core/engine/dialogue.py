from pathlib import Path
import random

class DialogueRetriever:
    """Retrieves persona-specific dialogue phrases from markdown databases."""
    def __init__(self, dialogue_path: str | Path | None):
        self.intents: dict[str, list[str]] = {}
        if dialogue_path:
            self._load(Path(dialogue_path))

    def _read_with_fallback(self, path: Path) -> str:
        """Read file with UTF-8 and Latin-1 fallback."""
        for enc in ['utf-8', 'latin-1']:
            try:
                return path.read_text(encoding=enc)
            except (UnicodeDecodeError, IOError, OSError):
                continue
        return ""

    def _load(self, path: Path) -> None:
        """[ALFRED] Secure dialogue loader with robust parsing and encoding fallbacks."""
        if not path.exists() or path.stat().st_size > 500*1024:
            return
        try:
            content = self._read_with_fallback(path)
            if not content:
                return

            for sec in content.split("# INTENT:")[1:]:
                lines = [l.strip().strip('"') for l in sec.strip().splitlines() if l.strip()]
                if len(lines) > 1:
                    self.intents[lines[0]] = lines[1:]
        except Exception:
            pass

    def get(self, intent: str, fallback: str = "...") -> str:
        """Get a random phrase for an intent, with a safe fallback."""
        opts = self.intents.get(intent, [])
        return random.choice(opts) if opts else fallback

    def __repr__(self):
        return f"<DialogueRetriever: {len(self.intents)} intents loaded>"
