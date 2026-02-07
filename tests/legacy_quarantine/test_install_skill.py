import unittest
import os
import shutil
import tempfile
import json
from unittest.mock import patch, MagicMock
from pathlib import Path
from importlib.machinery import SourceFileLoader

# Load the script dynamically
SCRIPT_PATH = Path(__file__).parent.parent / ".agent" / "scripts" / "install_skill.py"
install_script = SourceFileLoader("install_skill", str(SCRIPT_PATH)).load_module()

class TestInstallSkill(unittest.TestCase):
    def setUp(self):
        # Create temp environment
        self.test_dir = Path(tempfile.mkdtemp())
        self.agent_dir = self.test_dir / ".agent" # install_skill expects to be in .agent/scripts usually, but we pass root
        # Actually logic is: base_path = target_root. 
        # config is at base_path/config.json
        # skills are at base_path/skills
        
        self.base_path = self.test_dir
        
        self.config_path = self.base_path / "config.json"
        
        # Mock Framework Root (Global Registry)
        self.framework_root = self.test_dir / "CorvusStar"
        self.global_skills = self.framework_root / "skills_db"
        
        # Create Structure
        self.global_skills.mkdir(parents=True)
        (self.base_path / "skills").mkdir(parents=True)
        
        # Create a Mock Global Skill
        (self.global_skills / "test-skill").mkdir()
        with open(self.global_skills / "test-skill" / "SKILL.md", 'w') as f:
            f.write("Test Skill Content")
        
        # Setup Config
        with open(self.config_path, 'w') as f:
            json.dump({"FrameworkRoot": str(self.framework_root)}, f)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    @patch("builtins.input", return_value="y")
    def test_install_valid_skill(self, mock_input):
        # Run install
        install_script.install_skill("test-skill", str(self.base_path))
        
        # Assert
        installed_path = self.base_path / "skills" / "test-skill"
        self.assertTrue(installed_path.exists())
        self.assertTrue((installed_path / "SKILL.md").exists())

    def test_install_missing_skill(self):
        # Capture stdout? For now just ensure it doesn't crash or create dir
        install_script.install_skill("missing-skill", str(self.base_path))
        
        installed_path = self.base_path / "skills" / "missing-skill"
        self.assertFalse(installed_path.exists())

    def test_already_installed(self):
        # Pre-install
        (self.base_path / "skills" / "test-skill").mkdir(parents=True, exist_ok=True)
        # Create a "local modification" marker
        (self.base_path / "skills" / "test-skill" / "marker.txt").touch()
        
        install_script.install_skill("test-skill", str(self.base_path))
        
        # Should NOT overwrite (marker should still exist, logic says "return")
        self.assertTrue((self.base_path / "skills" / "test-skill" / "marker.txt").exists())

if __name__ == '__main__':
    unittest.main()
