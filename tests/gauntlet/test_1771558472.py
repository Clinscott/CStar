import sys
from pathlib import Path
_PROJECT_ROOT = Path(r"C:\Users\Craig\Corvus\CorvusStar").resolve()
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

To create a reproduction of the scaffolded test suite for `debug_env.py`, follow these steps. This script is designed to be self-contained: it will create the necessary directory structure, write the files, and provide the command to run the tests.

### Prerequisites
You will need to have `pytest` and `python-dotenv` installed:
```bash
pip install pytest python-dotenv
### 1. The Reproduction Script

Save the following code as `reproduce_issue.py`. When run, it generates the project structure described in the context.

import os
from pathlib import Path

def setup_project():
    # Define paths
    root = Path.cwd() / "repro_project"
    tests_dir = root / "tests"

    # Create directories
    tests_dir.mkdir(parents=True, exist_ok=True)

    # 1. Create debug_env.py
    debug_env_content = """import os
from pathlib import Path
from dotenv import load_dotenv

# Assumes .env.local is in the same directory as the script
root = Path(__file__).parent.resolve()
env_path = root / ".env.local"

print(f"--- Running debug_env.py ---")
print(f"Loading from: {env_path}")
print(f"File exists: {env_path.exists()}")
if env_path.exists():
    print(f"Content head: {env_path.read_text()[:50].strip()}")

success = load_dotenv(dotenv_path=env_path, verbose=True)
print(f"Load success: {success}")
print(f"GOOGLE_API_KEY: {os.getenv('GOOGLE_API_KEY')}")
print(f"--------------------------")
"""
    (root / "debug_env.py").write_text(debug_env_content)

    # 2. Create tests/conftest.py
    conftest_content = """import pytest
import os
from pathlib import Path

@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    # This path is relative to conftest.py. Go up two levels to reach the project root.
    project_root = Path(__file__).parent.parent.resolve()
    env_path = project_root / ".env.local"
    test_api_key = "TEST_API_KEY_VALUE"

    # --- Setup ---
    print(f"\\n[Setup] Creating temporary test file: {env_path}")
    with open(env_path, "w") as f:
        f.write(f"GOOGLE_API_KEY={test_api_key}\\n")

    # Also set it in the current environment for direct checks
    os.environ["GOOGLE_API_KEY"] = test_api_key

    yield

    # --- Teardown ---
    if env_path.exists():
        os.remove(env_path)
        print(f"\\n[Teardown] Removed temporary test file: {env_path}")
    if "GOOGLE_API_KEY" in os.environ:
        del os.environ["GOOGLE_API_KEY"]
"""
    (tests_dir / "conftest.py").write_text(conftest_content)

    # 3. Create tests/test_debug_env.py
    test_content = """import os
import subprocess
import sys
from pathlib import Path

def test_fixture_sets_env_variable_directly():
    api_key = os.getenv("GOOGLE_API_KEY")
    assert api_key == "TEST_API_KEY_VALUE"

def test_debug_env_script_loads_key_from_test_file():
    project_root = Path(__file__).parent.parent
    script_path = project_root / "debug_env.py"

    process = subprocess.run(
        [sys.executable, str(script_path)],
        capture_output=True,
        text=True,
        check=False
    )

    assert process.returncode == 0, f"Script failed: {process.stderr}"
    expected_output = "GOOGLE_API_KEY: TEST_API_KEY_VALUE"
    assert expected_output in process.stdout
"""
    (tests_dir / "test_debug_env.py").write_text(test_content)

    # 4. Create pytest.ini
    pytest_ini_content = """[pytest]
capture = no
"""
    (root / "pytest.ini").write_text(pytest_ini_content)

    # 5. Create empty __init__.py
    (tests_dir / "__init__.py").touch()

    print(f"Project scaffolded in: {root}")
    print("Run the following commands:")
    print(f"cd repro_project")
    print(f"pytest -v")

if __name__ == "__main__":
    setup_project()
### 2. Running the Reproduction

1. **Generate the project:**
   ```bash
   python reproduce_issue.py
   ```

2. **Execute the tests:**
   ```bash
   cd repro_project
   pytest -v
   ```

### What this tests:
1. **Fixture Logic**: It verifies that `conftest.py` successfully creates a `.env.local` file in the root directory before any tests run.
2. **Pathing Integrity**: It confirms that `debug_env.py` (which uses `Path(__file__).parent`) correctly identifies the `.env.local` file even when the project is being invoked by a test runner.
3. **Subprocess Isolation**: It confirms that when `debug_env.py` is executed as a standalone script (via `subprocess`), it correctly loads the environment variables using `python-dotenv`.

### Expected Results:
The output will show the `[Setup]` block creating the file, two `PASSED` tests, the actual print statements from `debug_env.py` (due to `capture = no` in `pytest.ini`), and the `[Teardown]` block removing the temporary file.
