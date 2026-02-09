import os
import re

from .vector import SovereignVector


class Cortex:
    """
    The Cortex: A Retrieval Augmented Generation (RAG) module for Corvus Star.
    It ingests the project's own documentation to answer questions about its laws.
    """
    def __init__(self, project_root, base_path):
        self.project_root = project_root
        # Initialize a fresh brain for knowledge (separate from skills)
        self.brain = SovereignVector(stopwords_path=os.path.join(base_path, "scripts", "stopwords.json"))
        
        # Knowledge Sources
        self.knowledge_map = {
            "AGENTS.md": os.path.join(project_root, "AGENTS.md"),
            "wireframe.md": os.path.join(project_root, "wireframe.md"),
            "memories.md": os.path.join(project_root, "memories.md"),
            "SovereignFish.md": os.path.join(project_root, "SovereignFish.md")
        }
        self._ingest()
    
    def _ingest(self):
        for name, path in self.knowledge_map.items():
            if not os.path.exists(path): continue
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Chunk by Headers (Markdown)
                # Split capturing the delimiter
                sections = re.split(r'(^#+ .*$)', content, flags=re.MULTILINE)
                
                current_header = name
                
                # If the file doesn't start with a header, the first chunk is "intro"
                if sections and not sections[0].startswith('#'):
                     self.brain.add_skill(f"{name} > Intro", sections[0].strip())

                for i in range(len(sections)):
                    section = sections[i].strip()
                    if not section: continue
                    
                    if section.startswith('#'):
                        current_header = f"{name} > {section.lstrip('#').strip()}"
                    else:
                        # This is content for the previous header
                        # Add to Brain: Trigger = Header, Content = Text
                        # We append random ID to trigger if duplicate headers exist? 
                        # SovereignVector overwrites duplicates. 
                        # For RAG, unique triggers are better. 
                        # We'll trust the headers are mostly unique or the last one wins (fine for now).
                        self.brain.add_skill(current_header, section)
            except Exception as e:
                # Fail silently, Cortex is auxiliary
                pass
        
        self.brain.build_index()

    def query(self, text):
        return self.brain.search(text)
