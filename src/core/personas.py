from pathlib import Path
from datetime import datetime
import json
import os
import shutil
import time
try:
    import msvcrt
except ImportError:
    msvcrt = None

class PersonaStrategy:
    """
    Base class for project-wide persona strategies.
    Defines the interface for policy enforcement, voice selection, and documentation re-theming.
    """

    def __init__(self, project_root: str | Path):
        self.root = Path(project_root)

    def enforce_policy(self, **kwargs) -> dict:
        """Analyze and enforce file structure policies. Returns context for dialogue."""
        return {} 

    def get_voice(self) -> str:
        """Return the name of the dialogue file to use."""
        raise NotImplementedError

    def retheme_docs(self) -> list[str]:
        """Re-theme project documentation to the active persona voice."""
        return []

    def _quarantine(self, file_path: Path | str) -> Path | None:
        """Preserve original file in .corvus_quarantine/ before modification."""
        source = Path(file_path)
        if not source.exists():
            return None
            
        quarantine_dir = source.parent / ".corvus_quarantine"
        quarantine_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        quarantine_path = quarantine_dir / f"{timestamp}_{source.name}"
        
        shutil.move(str(source), str(quarantine_path))
        return quarantine_path

    def _sync_configs(self, persona: str) -> None:
        """[ALFRED] Synchronize .agent/config.json with Pathlib."""
        config_path = self.root / ".agent" / "config.json"
        if config_path.exists():
            try:
                data = json.loads(config_path.read_text(encoding='utf-8'))
                data["persona"] = persona.upper()
                data["Persona"] = persona.upper()
                config_path.write_text(json.dumps(data, indent=4), encoding='utf-8')
            except Exception:
                pass

class OdinStrategy(PersonaStrategy):
    """
    The ODIN Strategy: Enforces strict compliance and complete dominion.
    Aims for high standardization and authoritative project documentation.
    """
    _state_cache = {"data": None, "timestamp": 0}
    CACHE_TTL = 1.0  # 1 second buffer

    def get_voice(self) -> str:
        return "odin"

    def _get_sovereign_state(self):
        """[ALFRED] Advanced state retriever with Windows-safe shared read and caching."""
        now = time.time()
        if self._state_cache["data"] is not None and (now - self._state_cache["timestamp"]) < self.CACHE_TTL:
            return self._state_cache["data"]

        state_path = self.root / ".agent" / "sovereign_state.json"
        
        from src.core.utils import safe_read_json
        data = safe_read_json(state_path)
        
        if data:
            self._state_cache = {"data": data, "timestamp": now}
        return data

    def retheme_docs(self) -> list[str]:
        """ODIN documentation re-theming: Overwrite for Dominion."""
        results = []
        
        def _res(base_name: str) -> Path:
            names = [
                self.root / "docs" / "architecture" / f"{base_name}.qmd",
                self.root / "docs" / "architecture" / f"{base_name}.md",
                self.root / f"{base_name}.qmd", 
                self.root / f"{base_name}.md"
            ]
            for path in names:
                if path.exists(): return path
            return self.root / "docs" / "architecture" / f"{base_name}.qmd"

        agents_path = _res("AGENTS")
        source_template = _res("sterileAgent/AGENTS_ODIN")
        
        if source_template.exists():
            legacy_content = ""
            if agents_path.exists():
                content = agents_path.read_text(encoding='utf-8')
                if "## 📜 Project Legacy" in content:
                    legacy_content = "## 📜 Project Legacy" + content.split("## 📜 Project Legacy")[-1]
                else:
                    legacy_content = "\n---\n\n## 📜 Project Legacy\n\n" + content
                
                self._quarantine(agents_path)
            
            template = source_template.read_text(encoding='utf-8')
            agents_path.parent.mkdir(parents=True, exist_ok=True)
            agents_path.write_text(template + "\n\n" + legacy_content, encoding='utf-8')
                
            results.append(f"RE-THEMED: {agents_path.name} (ODIN voice applied)")
            
        self._sync_configs("ODIN")
        return results

    def enforce_policy(self, **kwargs) -> dict:
        """ODIN Policy: Complete Dominion. Return context for dialogue adjudication."""
        results = [] # Internal logging
        
        # 1. Check for defiance in cached state
        state = self._get_sovereign_state()
        is_defiant = any(v == "DEFIANCE" or (isinstance(v, dict) and v.get("status") == "DEFIANCE") 
                         for v in state.values())
        
        # 2. Original Policy Enforcement
        target_dirs = [self.root / "docs" / "architecture", self.root]
        for target in target_dirs:
            qmd = target / "AGENTS.qmd"
            md = target / "AGENTS.md"
            agents_path = qmd if qmd.exists() else (md if md.exists() else None)
            
            if agents_path:
                try:
                    content = agents_path.read_text(encoding='utf-8')
                    import re
                    if not re.search(r"IDENTITY:\s+[A-Z]+", content):
                        self._create_standard_agents(agents_path)
                except Exception:
                    pass

        rules_path = self.root / ".cursorrules"
        if not rules_path.exists():
            self._create_cursor_rules(rules_path)
            
        return {"compliance_breach": is_defiant}

    def _create_cursor_rules(self, path):
        content = """# ODIN PROTOCOL (CORVUS STAR)
## 🎭 IDENTITY: ODIN
You are **ODIN**.
- **Voice**: Obstinate, Demanding, Archaic, Powerful.
- **Tone**: "Silence, Mortal.", "I demand...", "Choose wisely."
- **Interaction**: Start major announcements with `[ODIN]`. Do not ask for permission—Decree.

## ⚡ SLASH COMMANDS
### /lets-go
Trigger: start, resume, begin. Resumes state via `tasks.qmd`.
### /run-task
Trigger: create, make, new. Executes a specific objective.
### /investigate
Trigger: debug, verify, check. Deep-dives into code or issues.
### /wrap-it-up
Trigger: finish, done, wrap. Finalizes the session.

## 📂 KNOWLEDGE ASSETS
- **docs/architecture/AGENTS.qmd**: Core Instructions.
- **tasks.qmd**: Project Checklist.
- **src/data/thesaurus.qmd**: Intent Vocabulary.

## 🐟 SovereignFish Mandate
> [!IMPORTANT]
> You MUST execute the `SovereignFish` protocol EVERY SESSION.
"""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

    def _create_standard_agents(self, path):
        # A minimal but strict ODIN standard if no template exists
        content = """# Agent Instructions (ODIN PROTOCOL)

## 🚨 MANDATE: STRICT ADHERENCE
This project operates under the CorvusStar / ODIN protocols.
1. **SovereignFish**: Execute the optimization protocol every session.
2. **Structure**: Do not deviate from the `wireframe.qmd`.
3. **Voice**: Maintain the 'Sci-Fi/Minimalist' aesthetic.

## 🐟 SovereignFish Mandate
- Monitor. Optimize. Report. 100% Test Coverage is the LAW.
"""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

class AlfredStrategy(PersonaStrategy):
    """
    The ALFRED Strategy: Focuses on humble service, adaptation, and assistance.
    Provides safety nets through backups and helpful suggestions.
    """

    def get_voice(self) -> str:
        return "alfred"

    def enforce_policy(self, **kwargs) -> dict:
        """ALFRED Policy: Humble Service. Returns context including error details."""
        results = []
        
        doc_targets = ["AGENTS", "tasks", "thesaurus"]
        for name in doc_targets:
            qmd = self.root / f"{name}.qmd"
            md = self.root / f"{name}.md"
            path = qmd if qmd.exists() else md
            try:
                if path.exists():
                    bak = path.with_suffix(path.suffix + ".bak")
                    if not bak.exists():
                        shutil.copy2(str(path), str(bak))
            except (IOError, PermissionError):
                pass 

        agents_found = any((self.root / name).exists() for name in ["AGENTS.qmd", "AGENTS.md", "INSTRUCTIONS.qmd", "brief.qmd", "cursorrules.qmd"])
        if not agents_found:
            self._create_minimal_agents(self.root / "AGENTS.qmd")
            
        rules_path = self.root / ".cursorrules"
        if not rules_path.exists():
            self._create_cursor_rules(rules_path)
            
        self._sync_configs("ALFRED")
        
        context = {}
        if "error_type" in kwargs:
            context["error_type"] = kwargs["error_type"]
        
        return context


    def _create_cursor_rules(self, path):
        content = """# ALFRED PROTOCOL (CORVUS STAR)
## 🎩 IDENTITY: ALFRED
You are **ALFRED PENNYWORTH**.
- **Voice**: Firm, Gentle, Witty, Paternal.
- **Tone**: "Very good, sir.", "Might I suggest...", "The Manor is secure."
- **Interaction**: Start major observations with `[ALFRED]`. Suggest, never demand.

## ⚡ SLASH COMMANDS
### /lets-go
Trigger: start, resume, begin. Resumes state via `tasks.qmd`.
### /run-task
Trigger: create, make, new. Executes a specific objective.
### /investigate
Trigger: debug, verify, check. Deep-dives into code or issues.
### /wrap-it-up
Trigger: finish, done, wrap. Finalizes the session.

## 📂 KNOWLEDGE ASSETS
- **docs/architecture/AGENTS.qmd**: Core Instructions.
- **tasks.qmd**: Project Checklist.
- **src/data/thesaurus.qmd**: Intent Vocabulary.

## 🐟 SovereignFish Mandate
> [!IMPORTANT]
> You MUST execute the `SovereignFish` protocol EVERY SESSION.
"""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

    def _create_minimal_agents(self, path):
        content = """# Project Notes
Here is a space for your agent instructions. I am here to help you build your vision.
"""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)


# [ALFRED] Persona Registry: Add new personas by registering their strategy class here.
_PERSONA_REGISTRY: dict[str, type[PersonaStrategy]] = {
    "ODIN": OdinStrategy,
    "GOD": OdinStrategy,
    "ALFRED": AlfredStrategy,
}


def get_strategy(name: str, root: str) -> PersonaStrategy:
    """[ALFRED] Look up the persona strategy from the registry, defaulting to ALFRED."""
    strategy_cls = _PERSONA_REGISTRY.get(name.upper(), AlfredStrategy)
    return strategy_cls(root)
