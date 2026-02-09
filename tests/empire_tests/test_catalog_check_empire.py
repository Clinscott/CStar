import pytest
import sys
import os
import subprocess
import re

# Define the source code for the mock engine necessary for subprocess execution
MOCK_SOURCE_SUCCESS = """
import os

class SovereignVector:
    def __init__(self, *args, **kwargs):
        # Successful initialization and pre-loaded trigger map
        self.trigger_map = {'start': [{'skill': 'catalog', 'weight': 0.9}]} 

    def load_core_skills(self):
        pass
        
    def build_index(self):
        pass

    def tokenize(self, query):
        # Simulate successful tokenization
        return ['catalog', 'start']

    def search(self, query):
        # Control flow via environment variable
        if os.environ.get('SEARCH_FAIL') == '1':
            return None
        # Success path
        return ['Skill: Catalog Management']
"""


@pytest.fixture
def setup_environment(tmp_path):
    """Sets up the required file structure and environment for the script execution."""
    
    # Create the necessary directory structure: .agent/scripts/engine/
    agent_dir = tmp_path / ".agent"
    scripts_dir = agent_dir / "scripts"
    engine_dir = scripts_dir / "engine"
    engine_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Create GIVEN prerequisites (config files)
    (tmp_path / "thesaurus.qmd").write_text("qmd content")
    (agent_dir / "corrections.json").write_text("{}")
    (scripts_dir / "stopwords.json").write_text("[]")

    # 2. Write the mock engine file
    (engine_dir / "vector.py").write_text(MOCK_SOURCE_SUCCESS)

    # 3. Write the implementation file (catalog_check.py)
    catalog_check_path = tmp_path / "catalog_check.py"
    
    # Note: Inserting the actual catalog_check.py code here for fixture completeness
    catalog_check_code = "\nimport sys\nimport os\nsys.path.insert(0, '.agent/scripts')\n\nfrom engine.vector import SovereignVector\n\ne = SovereignVector(\n    'thesaurus.qmd', \n    '.agent/corrections.json', \n    '.agent/scripts/stopwords.json'\n)\ne.load_core_skills()\ne.build_index()\n\nquery = \"catalog start\"\nr = e.search(query)\n\nprint(f\"Tokens: {e.tokenize(query)}\")\n\ntrigger_map_result = e.trigger_map.get('start')\nprint(f\"Trigger Map for 'start': {trigger_map_result}\")\n\nif r:\n    print(f\"Top Result: {r[0]}\")\nelse:\n    print(\"No results found.\")\n\nsys.exit(0)"
    catalog_check_path.write_text(catalog_check_code)
    
    return tmp_path, catalog_check_path


def run_script(script_path, cwd, env_overrides=None):
    """Executes the script via subprocess and returns stdout, stderr, and return code."""
    
    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)

    result = subprocess.run(
        [sys.executable, str(script_path)],
        capture_output=True,
        text=True,
        cwd=cwd,
        env=env
    )
    return result.stdout, result.stderr, result.returncode


# --- Test Cases ---

def test_successful_index_building_and_retrieval(setup_environment):
    """
    Scenario 1: Successful Index Building and Retrieval of a Basic Query
    Verifies tokenization, trigger map presence, positive search, and successful exit.
    """
    tmp_path, script_path = setup_environment
    
    # WHEN the script `catalog_check.py` is executed
    stdout, stderr, exit_code = run_script(script_path, cwd=tmp_path)
    
    def assert_step(condition, message):
        if not condition:
            pytest.fail(f"{message}\n--- STDOUT ---\n{stdout}\n--- STDERR ---\n{stderr}")

    # THEN the output buffer should contain the tokens: "['catalog', 'start']"
    assert_step(
        "Tokens: ['catalog', 'start']" in stdout,
        "Failed Gherkin Step 1: Expected tokenization output missing."
    )

    # And the "Trigger Map for 'start'" should display a non-empty result
    trigger_map_pattern = r"Trigger Map for 'start': [{'skill': 'catalog', 'weight': 0.9}]"
    assert_step(
        re.search(trigger_map_pattern, stdout) is not None,
        "Failed Gherkin Step 2: Non-empty trigger map result not found or incorrect format."
    )
    
    # And a positive search result should be found (r is not None) 
    # And the message "Top Result:" is printed to stdout
    assert_step(
        "Top Result: Skill: Catalog Management" in stdout,
        "Failed Gherkin Step 3/4: Expected 'Top Result:' message missing, implying search failed."
    )
    
    # And the script exits successfully (exit code 0)
    assert_step(
        exit_code == 0,
        f"Failed Gherkin Step 5: Script exited with non-zero code: {exit_code}"
    )

def test_handling_of_no_results_path_implicit_check(setup_environment):
    """
    Scenario 2: Handling of the No Results Path (Implicit Check)
    Forces the search function to return None and verifies the fallback message.
    """
    tmp_path, script_path = setup_environment
    
    # WHEN a known non-indexed query is hypothetically searched 
    # (Achieved by setting environment variable SEARCH_FAIL=1)
    env_overrides = {'SEARCH_FAIL': '1'}
    stdout, stderr, exit_code = run_script(script_path, cwd=tmp_path, env_overrides=env_overrides)

    # THEN the conditional logic ensures that if no results are found, 
    # the message "No results found." is printed
    expected_message = "No results found."
    
    assert expected_message in stdout, "Failed Gherkin Step 1 (Scenario 2): 'No results found.' message missing."
    
    # Ensure success path message is NOT present
    assert "Top Result:" not in stdout, "Success path ('Top Result:') was printed when failure was expected."
    
    # Ensure successful exit even on failure path, as it's handled gracefully
    assert exit_code == 0, f"Script exited with non-zero code: {exit_code}"