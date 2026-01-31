import os
import shutil

class PersonaStrategy:
    def __init__(self, project_root):
        self.root = project_root

    def enforce_policy(self):
        """Analyze and enforce file structure policies."""
        raise NotImplementedError 

    def get_voice(self):
        """Return the name of the dialogue file to use."""
        raise NotImplementedError

class OdinStrategy(PersonaStrategy):
    def get_voice(self):
        return "odin"

    def enforce_policy(self):
        """ODIN Policy: Complete Dominion. Standardize or Perish."""
        results = []
        
        # 1. Enforce AGENTS.md
        agents_path = os.path.join(self.root, "AGENTS.md")
        std_agents_path = os.path.join(self.root, ".agent", "templates", "AGENTS.md") # Hypothetical source
        
        # In this context, we might not have a template folder, but we can check if it exists or is "Corvus-compliant"
        if not os.path.exists(agents_path):
             self._create_standard_agents(agents_path)
             results.append("CREATED: AGENTS.md (Standardized)")
        else:
            # ODIN reads headers. If "SovereignFish" is missing, he overwrites/injects.
            with open(agents_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if "SovereignFish Mandate" not in content:
                self._create_standard_agents(agents_path) # RUTHLESS OVERWRITE (or append prepend)
                results.append("REWRITTEN: AGENTS.md (Non-Compliant)")
            else:
                results.append("VERIFIED: AGENTS.md (Compliant)")

        # 2. Enforce tasks.md
        tasks_path = os.path.join(self.root, "tasks.md")
        if not os.path.exists(tasks_path):
            with open(tasks_path, 'w', encoding='utf-8') as f:
                f.write("# Tasks\n\n- [ ] Initialize Project\n")
            results.append("CREATED: tasks.md")
            
        return results

    def _create_standard_agents(self, path):
        # A minimal but strict ODIN standard if no template exists
        content = """# Agent Instructions (ODIN PROTOCOL)

## 🚨 MANDATE: STRICT ADHERENCE
This project operates under the CorvusStar / ODIN protocols.
1. **SovereignFish**: Execute the optimization protocol every session.
2. **Structure**: Do not deviate from the `wireframe.md`.
3. **Voice**: Maintain the 'Sci-Fi/Minimalist' aesthetic.

## 🐟 SovereignFish Mandate
- Monitor. Optimize. Report.
"""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

class AlfredStrategy(PersonaStrategy):
    def get_voice(self):
        return "alfred"

    def enforce_policy(self):
        """ALFRED Policy: Humble Service. Adapt and Assist."""
        results = []
        
        # 1. Check for Agent Instructions
        agents_path = os.path.join(self.root, "AGENTS.md")
        
        if not os.path.exists(agents_path):
            # Check for generic names
            for name in ["INSTRUCTIONS.md", "brief.md", "cursorrules.md"]:
                alt = os.path.join(self.root, name)
                if os.path.exists(alt):
                    results.append(f"ADAPTED: Found {name}, treating as Instructions.")
                    return results
            
            # If nothing, politely create a minimal one
            self._create_minimal_agents(agents_path)
            results.append("SUGGESTED: Created minimal AGENTS.md")
        else:
             results.append("OBSERVED: AGENTS.md exists. No changes made.")

        return results

    def _create_minimal_agents(self, path):
        content = """# Project Notes
Here is a space for your agent instructions.
"""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

def get_strategy(name, root):
    if name.upper() == "GOD" or name.upper() == "ODIN":
        return OdinStrategy(root)
    return AlfredStrategy(root)
