import json
import os

import pytest

# Conditional import for test environments
try:
    from src.core.engine.vector import SovereignVector
except ImportError:
    SovereignVector = None

@pytest.fixture(scope="module")
def sovereign_vector_instance(tmp_path_factory):
    """Sets up a temporary file structure and an initialized SovereignVector instance for testing."""
    if not SovereignVector:
        pytest.skip("SovereignVector class not found. Check path configuration.")

    # Create a temporary root directory for the test execution
    root_path = tmp_path_factory.mktemp("sv_root")

    # Create all necessary directories and dummy files
    agent_dir = root_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "scripts").mkdir()
    agent_skills_dir = agent_dir / "skills"
    agent_skills_dir.mkdir()

    framework_root_dir = root_path / "FrameworkRoot"
    framework_root_dir.mkdir()
    framework_skills_dir = framework_root_dir / "skills_db"
    framework_skills_dir.mkdir()

    # Create config.json pointing to the temp FrameworkRoot
    with open(agent_dir / "config.json", "w") as f:
        json.dump({"FrameworkRoot": str(framework_root_dir)}, f)

    # Create dummy files required by SovereignVector constructor
    (root_path / "thesaurus.qmd").write_text("---\ntitle: Thesaurus\n---")
    (agent_dir / "corrections.json").write_text("{}")
    (agent_dir / "scripts" / "stopwords.json").write_text("[]")

    # Create dummy skill files to be indexed
    (agent_skills_dir / "project.md").write_text("# Wrap up project\n**trigger**: project.wrap_up")
    (agent_skills_dir / "ui.md").write_text("# Implement UI\n**trigger**: ui.implement")
    (framework_skills_dir / "graphics.md").write_text("# Refine visuals\n**trigger**: GLOBAL:graphics.refine")

    original_cwd = os.getcwd()
    os.chdir(root_path)

    try:
        # GIVEN: a SovereignVector instance is initialized with configuration
        sv = SovereignVector(
            'thesaurus.qmd',
            '.agent/corrections.json',
            '.agent/scripts/stopwords.json'
        )

        # AND: the SovereignVector has loaded skills
        sv.load_core_skills() # Core skills should be self-contained
        sv.load_skills_from_dir('.agent/skills')
        sv.load_skills_from_dir(str(framework_skills_dir), prefix="GLOBAL:")

        # AND: the SovereignVector has built its index
        sv.build_index()
        yield sv
    finally:
        os.chdir(original_cwd)

@pytest.mark.parametrize("query", [
    "please wrap up our project now",
    "visuals refine",
    "please implement our ui now"
])
def test_search_queries(sovereign_vector_instance, query):
    """Tests that searching for various queries returns valid results."""
    # WHEN: I search for a query
    results = sovereign_vector_instance.search(query)

    # THEN: the search should return a list of results
    assert isinstance(results, list), f"Expected a list for query '{query}', but got {type(results)}"
    assert len(results) > 0, f"Expected search results for query '{query}', but got an empty list."

    # AND: the results should contain a score and a trigger
    first_result = results[0]
    assert 'score' in first_result
    assert 'trigger' in first_result
    assert isinstance(first_result['score'], float)
    assert isinstance(first_result['trigger'], str)
