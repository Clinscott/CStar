import os
import shutil

__all__ = ["get_strategy", "PersonaStrategy", "OdinStrategy", "AlfredStrategy"]

class PersonaStrategy:
    def __init__(self, project_root):
        self.root = project_root

    def enforce_policy(self):
        """Analyze and enforce file structure policies."""
        raise NotImplementedError 

    def get_voice(self):
        """Return the name of the dialogue file to use."""
        raise NotImplementedError

    def retheme_docs(self):
        """Re-theme project documentation to the active persona voice."""
        return []

    def _quarantine(self, file_path):
        """Preserve original file in .corvus_quarantine/ before modification."""
        if not os.path.exists(file_path):
            return
            
        quarantine_dir = os.path.join(os.path.dirname(file_path), ".corvus_quarantine")
        os.makedirs(quarantine_dir, exist_ok=True)
        
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        basename = os.path.basename(file_path)
        quarantine_path = os.path.join(quarantine_dir, f"{timestamp}_{basename}")
        
        shutil.move(file_path, quarantine_path)
        return quarantine_path

    def _sync_configs(self, persona):
        """[ALFRED] Synchronize .agent/config.json."""
        import json
        config_path = os.path.join(self.root, ".agent", "config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                # Store both casing for robustness
                data["persona"] = persona.upper()
                data["Persona"] = persona.upper()
                
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=4)
            except Exception:
                pass

class OdinStrategy(PersonaStrategy):
    def get_voice(self):
        return "odin"

    def retheme_docs(self):
        """ODIN documentation re-theming: Overwrite for Dominion."""
        results = []
        
        # Target: AGENTS.qmd (Primary) or AGENTS.md
        def _res(base_name):
            names = [
                os.path.join("docs", "architecture", f"{base_name}.qmd"),
                os.path.join("docs", "architecture", f"{base_name}.md"),
                f"{base_name}.qmd", f"{base_name}.md"
            ]
            for name in names:
                path = os.path.join(self.root, name)
                if os.path.exists(path): return path
            return os.path.join(self.root, "docs", "architecture", f"{base_name}.qmd") # Default to QMD

        agents_path = _res("AGENTS")
        source_template = _res("sterileAgent/AGENTS_ODIN")
        
        if os.path.exists(source_template):
            # Capture legacy content if it exists
            legacy_content = ""
            if os.path.exists(agents_path):
                with open(agents_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # If already has legacy section, preserve it, else the whole file
                    if "## 📜 Project Legacy" in content:
                        legacy_content = "## 📜 Project Legacy" + content.split("## 📜 Project Legacy")[-1]
                    else:
                        legacy_content = "\n---\n\n## 📜 Project Legacy\n\n" + content
                
                self._quarantine(agents_path)
            
            with open(source_template, 'r', encoding='utf-8') as f:
                template = f.read()
            
            with open(agents_path, 'w', encoding='utf-8') as f:
                f.write(template + "\n\n" + legacy_content)
                
            results.append(f"RE-THEMED: {os.path.basename(agents_path)} (ODIN voice applied)")
            
        self._sync_configs("ODIN")
        return results


    def enforce_policy(self):
        """ODIN Policy: Complete Dominion. Standardize or Perish."""
        results = []
        
        # 1. Enforce AGENTS.qmd (Main)
        for target in [os.path.join(self.root, "docs", "architecture"), self.root]:
            qmd = os.path.join(target, "AGENTS.qmd")
            md = os.path.join(target, "AGENTS.md")
            agents_path = qmd if os.path.exists(qmd) else md
            try:
                if os.path.exists(agents_path):
                    with open(agents_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # Check for absolute requirements: ODIN or ALFRED identity, Symmetry, SovereignFish
                    if "ODIN" not in content and "ALFRED" not in content:
                        self._create_standard_agents(agents_path)
                        results.append(f"REWRITTEN: {os.path.relpath(agents_path, self.root)} (Compliance Enforced)")
                    else:
                        results.append(f"VERIFIED: {os.path.relpath(agents_path, self.root)} (Compliant)")
            except (IOError, PermissionError) as e:
                results.append(f"DEFIANCE: Failed to access {os.path.basename(agents_path)} ({str(e)})")

        # 2. Enforce .cursorrules (The System Directive)
        rules_path = os.path.join(self.root, ".cursorrules")
        create_rules = False
        if not os.path.exists(rules_path):
            create_rules = True
        else:
            with open(rules_path, 'r', encoding='utf-8') as f:
                content = f.read()
                # Proactive Persona Match: Overwrite if not ODIN
                if "IDENTITY: ODIN" not in content:
                    create_rules = True
        
        if create_rules:
            self._create_cursor_rules(rules_path)
            results.append("ENFORCED: .cursorrules (Forged for ODIN)")
            
        return results

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
    def get_voice(self):
        return "alfred"

    def enforce_policy(self):
        """ALFRED Policy: Humble Service. Adapt and Assist."""
        results = []
        
        # 1. Adaptive Backup (The Safety Net) - Support .qmd or .md
        doc_targets = ["AGENTS", "tasks", "thesaurus"]
        for name in doc_targets:
            qmd = os.path.join(self.root, f"{name}.qmd")
            md = os.path.join(self.root, f"{name}.md")
            path = qmd if os.path.exists(qmd) else md
            try:
                if os.path.exists(path):
                    bak = path + ".bak"
                    if not os.path.exists(bak):
                        shutil.copy2(path, bak)
                        results.append(f"PROVISIONED: Backup of {os.path.basename(path)}")
            except (IOError, PermissionError):
                pass # [ALFRED] Quietly fail if background process has lock

        # 2. Adaptive Discovery (Help the user find their own way)
        agents_found = False
        for name in ["AGENTS.qmd", "AGENTS.md", "INSTRUCTIONS.qmd", "brief.qmd", "cursorrules.qmd"]:
            if os.path.exists(os.path.join(self.root, name)):
                agents_found = True
                break
        
        if not agents_found:
            self._create_minimal_agents(os.path.join(self.root, "AGENTS.qmd"))
            results.append("SUGGESTED: Created minimal project notes.")
            
        # 3. Enforce .cursorrules (The Butler's Record)
        rules_path = os.path.join(self.root, ".cursorrules")
        create_rules = False
        if not os.path.exists(rules_path):
            create_rules = True
        else:
            with open(rules_path, 'r', encoding='utf-8') as f:
                content = f.read()
                # Proactive Persona Match: Overwrite if not ALFRED
                if "IDENTITY: ALFRED" not in content:
                    create_rules = True
        
        if create_rules:
            self._create_cursor_rules(rules_path)
            results.append("PROVISIONED: .cursorrules (The Archive is synchronized)")
            
        self._sync_configs("ALFRED")
        return results


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
