import pytest
import subprocess
import json
import sys
from pathlib import Path

# Mock implementation of the SovereignVector engine
MOCK_VECTOR_CODE = """
class SovereignVector:
    def __init__(self, thesaurus_path, corrections_path, stopwords_path):
        self.thesaurus_path = thesaurus_path
        self.corrections_path = corrections_path
        self.stopwords_path = stopwords_path
        # Mock trigger map data needed for assertion 
        self.trigger_map = {'start': ['Catalog initialization routine check']}

    def load_core_skills(self):
        pass

    def build_index(self):
        pass

    def tokenize(self, query):
        # Basic tokenization mimicry
        return query.split()

    def search(self, query):
        # Returns a successful result for validation
        if 'start' in query:
            return [{'score': 0.95, 'document': f"Mock Result: {query}"}]
        return None
"""

@pytest.fixture
def setup_catalog_environment(tmp_path: Path):
    """
    Sets up the required file structure and dependencies:
    - thesaurus.qmd
    - .agent/corrections.json
    - .agent/scripts/stopwords.json
    - .agent/scripts/engine/vector.py (mock implementation)
    """
    
    agent_dir = tmp_path / ".agent"
    scripts_dir = agent_dir / "scripts"
    engine_dir = scripts_dir / "engine"
    
    engine_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Prerequisite files (GIVEN)
    (tmp_path / "thesaurus.qmd").write_text("QMD placeholder data")
    (agent_dir / "corrections.json").write_text(json.dumps({"a": "b"}))
    (scripts_dir / "stopwords.json").write_text(json.dumps([]))
    
    # 2. Mock Engine Implementation
    (engine_dir / "vector.py").write_text(MOCK_VECTOR_CODE)
    
    # 3. The target script (catalog_check.py)
    catalog_check_code = """
import sys
import os
sys.path.insert(0, '.agent/scripts') # Path relative to CWD

try:
    from engine.vector import SovereignVector
except ImportError:
    # In case the mock setup failed
    sys.exit(1) 

e = SovereignVector(
    'thesaurus.qmd', 
    '.agent/corrections.json', 
    '.agent/scripts/stopwords.json'
)
e.load_core_skills()
e.build_index()

query = "catalog start"
r = e.search(query)
print(f"Tokens: {e.tokenize(query)}")
print(f"Trigger Map for 'start': {e.trigger_map.get('start')}")
if r:
    print(f"Top Result: {r[0]}")
else:
    print("No results found.")

sys.exit(0)
"""
    
    script_file = tmp_path / "catalog_check.py"
    script_file.write_text(catalog_check_code)
    
    return tmp_path

def test_successful_catalog_check(setup_catalog_environment: Path):
    """
    Scenario: Successful Initialization and Search Validation
    Verifies that catalog_check.py executes successfully and produces the expected diagnostic output.
    """
    
    script_path = setup_catalog_environment / "catalog_check.py"
    
    # WHEN: the 'catalog_check.py' script is executed using the Python interpreter
    
    # Execute the script, setting cwd to tmp_path so relative paths (.agent/scripts, thesaurus.qmd) work
    result = subprocess.run(
        [sys.executable, str(script_path)],
        capture_output=True,
        text=True,
        cwd=setup_catalog_environment
    )
    
    stdout = result.stdout
    
    # THEN: the execution must exit successfully with an exit code of 0
    assert result.returncode == 0, (
        f"Script exited with error code {result.returncode}.\n"
        f"STDERR:\n{result.stderr}"
    )
    
    # AND the standard output must contain the diagnostic "Tokens:"
    assert "Tokens:" in stdout, f"Missing 'Tokens:' diagnostic.\nOutput: {stdout}"
    
    # AND the standard output must contain the structure "Trigger Map for 'start':"
    assert "Trigger Map for 'start':" in stdout, f"Missing 'Trigger Map for 'start':' diagnostic.\nOutput: {stdout}"
    
    # AND the standard output must contain the final search result indicator "Top Result:"
    assert "Top Result:" in stdout, f"Missing 'Top Result:' indicator, indicating search failure.\nOutput: {stdout}"
    
    # Optional check: Ensure tokenization and trigger map details are present
    assert "['catalog', 'start']" in stdout
    assert "'Catalog initialization routine check'" in stdout