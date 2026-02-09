import os
import subprocess
import sys
import unittest

class TestCodeSentinel(unittest.TestCase):
    def setUp(self):
        self.script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".agent", "scripts", "code_sentinel.py")
        self.test_file = "temp_test_file.py"

    def tearDown(self):
        if os.path.exists(self.test_file):
            os.remove(self.test_file)

    def write_test_file(self, content):
        with open(self.test_file, "w", encoding="utf-8") as f:
            f.write(content)

    def run_sentinel(self, persona=None):
        cmd = [sys.executable, self.script_path, self.test_file]
        if persona:
            cmd.extend(["--persona", persona])
        
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["HUD_WIDTH"] = "120"
        
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            encoding="utf-8", 
            env=env
        )
        
        result.combined_output = (result.stdout or "") + (result.stderr or "")
        return result

    def test_clean_file(self):
        """Test that main and private functions pass."""
        self.write_test_file("""\"\"\"Module Docstring.\"\"\"
def main() -> None:
    \"\"\"Docstring.\"\"\"
    pass

def _private_func() -> None:
    \"\"\"Docstring.\"\"\"
    pass

class MyClass:
    \"\"\"Docstring.\"\"\"
    def method(self) -> None:
        \"\"\"Docstring.\"\"\"
        pass
""")
        result = self.run_sentinel(persona="ALFRED")
        self.assertEqual(result.returncode, 0, f"Clean file failed. Output:\n{result.combined_output}")
        self.assertIn("immaculate", result.combined_output.lower())

    def test_orphan_function(self):
        """Test that a public top-level function fails."""
        self.write_test_file("""\"\"\"Module Docstring.\"\"\"
def orphan_func() -> None:
    \"\"\"Docstring.\"\"\"
    pass
""")
        result = self.run_sentinel(persona="ODIN")
        self.assertEqual(result.returncode, 1, "Should have failed for orphan function")
        self.assertIn("ANOMALIES", result.combined_output)
        self.assertIn("STRUCT-001", result.combined_output)
        self.assertIn("orphan_func", result.combined_output)

    def test_ignored_function(self):
        """Test that @sentinel: ignore works."""
        self.write_test_file("""\"\"\"Module Docstring.\"\"\"
def legacy_func() -> None: # @sentinel: ignore
    \"\"\"Docstring.\"\"\"
    pass
""")
        result = self.run_sentinel(persona="ALFRED")
        self.assertEqual(result.returncode, 0, f"Ignored function should have passed. Output: {result.combined_output}")

    def test_persona_odin(self):
        """Test Odin-specific strings."""
        self.write_test_file("def breach(): pass")
        result = self.run_sentinel(persona="ODIN")
        self.assertIn("HEIMDALL", result.combined_output)
        self.assertIn("TARGET SECTOR", result.combined_output)

    def test_persona_alfred(self):
        """Test Alfred-specific strings."""
        self.write_test_file("def mess(): pass")
        result = self.run_sentinel(persona="ALFRED")
        self.assertIn("PERIMETER", result.combined_output)
        self.assertIn("SCAN AREA", result.combined_output)

if __name__ == "__main__":
    unittest.main()
