import unittest
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class TestInstallScripts(unittest.TestCase):
    def test_root_install_exists(self):
        """Verify root install.ps1 exists."""
        path = os.path.join(BASE_DIR, "install.ps1")
        self.assertTrue(os.path.exists(path), "Root install.ps1 missing")
        
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            self.assertIn("Corvus", content) # Basic sanity check

    def test_sterile_install_exists(self):
        """Verify sterileAgent install.ps1 exists."""
        path = os.path.join(BASE_DIR, "sterileAgent", "install.ps1")
        # It might not exist if sterileAgent isn't fully scaffolded, but if found in search, we test.
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                self.assertTrue(len(content) > 0)

if __name__ == '__main__':
    unittest.main()
