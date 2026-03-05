import re
import shlex
from typing import List, Tuple

class ShieldTrip(Exception):
    """Raised when Heimdall's Shield detects a destructive command."""
    pass

class HeimdallShield:
    """
    [WARDEN] The Destructive Command Guard (DCG).
    Intercepts and evaluates shell commands to prevent catastrophic data loss or system compromise.
    """
    
    # Patterns that are fundamentally destructive or dangerous
    DESTRUCTIVE_PATTERNS = [
        r"rm\s+-r[fF]?\s+(?:/|~|\*)",       # Recursive remove targeting root, home, or wildcards
        r"rm\s+-fR\s+.*",                   # Alternative flag ordering
        r"rm\s+.*-rf\s+.*",                 # For list joined strings
        r"mkfs",                            # Filesystem formatting
        r"dd\s+if=.*of=/dev",               # Raw disk writing
        r"git\s+reset\s+--hard",            # Destructive git reset
        r"git\s+clean\s+-f[dx]?",           # Destructive git clean
        r">\s*/dev/(s|h)d[a-z]",            # Redirection to raw disks
        r"chmod\s+-R\s+777\s+/",            # Recursive permission stripping on root
        r"chown\s+-R\s+.*:.*\s+/",          # Recursive ownership changes on root
        r":\(\)\{\s*:\|:&\s*\};:",          # Fork bomb
        r"wget\s+.*\|\s*(?:bash|sh)",       # Curl/Wget pipe to bash
        r"curl\s+.*\|\s*(?:bash|sh)",
        r"echo\s+.*>\s*/dev"                # Echo to disk
    ]

    def __init__(self):
        self.compiled_patterns = [re.compile(p) for p in self.DESTRUCTIVE_PATTERNS]

    def evaluate_command(self, cmd: str | List[str]) -> Tuple[bool, str]:
        """
        Evaluates a shell command against the destructive patterns.
        Returns (is_safe, reason).
        """
        # Normalize command to string for regex evaluation
        cmd_str = cmd if isinstance(cmd, str) else shlex.join(cmd)
        
        for pattern in self.compiled_patterns:
            if pattern.search(cmd_str):
                return False, f"Command matched destructive pattern: {pattern.pattern}"
                
        return True, "Command is safe."

    def enforce(self, cmd: str | List[str]) -> None:
        """
        Evaluates the command and raises ShieldTrip if it is destructive.
        """
        is_safe, reason = self.evaluate_command(cmd)
        if not is_safe:
            raise ShieldTrip(f"[HEIMDALL'S SHIELD] Execution Blocked: {reason}\nCommand: {cmd}")
