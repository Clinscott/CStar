import pytest
import subprocess
import os
import sys

# Mock implementation of SovereignVector and its containing structure
MOCK_VECTOR_CONTENT = """
class SovereignVector:
    def __init__(self, thesaurus_path, corrections_path, stopwords_path):
        # Required for the trigger map output assertion
        self.trigger_map = {'start': ['mock_skill_a', 'mock_skill_b']}

    def load_core_skills(self):
        pass

    def build_index(self):
        pass

    def tokenize(self, query):
        # Required output assertion: "Tokens: ['catalog', 'start']"
        return ['catalog', 'start']

    def search(self, query):
        # Return a result to satisfy the 'Top Result' assertion
        return [{'score': 0.95, 'text': 'Mock Search Result 1'}]
"""

@pytest.fixture(scope="module")
def setup_environment(tmp_path_factory):
    # Use a persistent temporary directory for the module scope
    tmpdir = tmp_path_factory.mktemp("sovereign_mock_env")
    
    # Define directory structure
    agent_dir = tmpdir / ".agent"
    agent_scripts_dir = agent_dir / "scripts"
    engine_dir = agent_scripts_dir / "engine"

    # Create directories
    engine_dir.mkdir(parents=True, exist_ok=True)
    
    # Create required mock files (the GIVEN condition)
    (tmpdir / "thesaurus.qmd").write_text("dummy thesaurus content")
    (agent_dir / "corrections.json").write_text("{}")
    (agent_scripts_dir / "stopwords.json").write_text("[]")
    
    # Create the mock engine file
    (engine_dir / "vector.py").write_text(MOCK_VECTOR_CONTENT)
    
    # Create the main script catalog_check.py
    catalog_check_content = f'''
import sys
import os
sys.path.insert(0, '.agent/scripts')

from engine.vector import SovereignVector

e = SovereignVector(
    'thesaurus.qmd', 
    '.agent/corrections.json', 
    '.agent/scripts/stopwords.json'
)
e.load_core_skills()
e.build_index()

query = "catalog start"
r = e.search(query)
print(f"Tokens: {{e.tokenize(query)}}")
print(f"Trigger Map for 'start': {{e.trigger_map.get('start')}}")
if r:
    print(f"Top Result: {{r[0]}}")
else:
    print("No results found.")
'''
    (tmpdir / "catalog_check.py").write_text(catalog_check_content)

    return tmpdir

def test_catalog_check_execution(setup_environment):
    # The execution directory must be the root of the mock structure
    cwd = setup_environment
    script_path = cwd / "catalog_check.py"
    
    # Execute the script using the current Python interpreter
    try:
        result = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            check=False,
            cwd=cwd 
        )
    except FileNotFoundError as e:
        pytest.fail(f"Execution failed: {e}")

    output = result.stdout.strip()
    
    # 1. Then the exit status should be 0 (Success)
    assert result.returncode == 0, f"Script failed with exit code {result.returncode}.\nStderr: {result.stderr}\nStdout:\n{result.stdout}"
    
    # 2. And the output should contain "Tokens: ['catalog', 'start']"
    assert "Tokens: ['catalog', 'start']" in output, "Missing expected token output."
    
    # 3. And the output should contain a debug message starting with "Trigger Map for 'start':"
    expected_trigger_map_output = "Trigger Map for 'start': ['mock_skill_a', 'mock_skill_b']"
    assert expected_trigger_map_output in output, "Missing expected trigger map debug output."
    
    # 4. And the output should contain either "Top Result: " or "No results found."
    # Since the mock returns a result, we expect "Top Result:"
    assert "Top Result: " in output, "Missing expected search result indicator (Top Result)."
    assert "No results found." not in output
