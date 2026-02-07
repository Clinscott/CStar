import os
import sys
import shutil
import unittest
from unittest.mock import MagicMock, patch

# Adjust path to import the script
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".agent", "scripts"))
from synapse_sync import Synapse

class TestGatekeeper(unittest.TestCase):
    def setUp(self):
        # Create a fake environment
        self.test_dir = os.path.join(os.path.dirname(__file__), "gatekeeper_env")
        self.local_skills = os.path.join(self.test_dir, "skills")
        self.core_skills = os.path.join(self.test_dir, "core", "skills")
        
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
            
        os.makedirs(self.local_skills)
        os.makedirs(self.core_skills)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def create_skill(self, name, content):
        path = os.path.join(self.local_skills, name)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    @patch('synapse_sync.HUD')
    def test_gatekeeper_logic(self, mock_hud):
        # Instantiate Synapse and override paths
        synapse = Synapse()
        synapse.project_root = self.test_dir
        synapse.core_path = os.path.join(self.test_dir, "core")
        synapse.config = {"KnowledgeCore": synapse.core_path} # Mock config to avoid loading real one

        # 1. Create Malformed Skill (Syntax Error)
        self.create_skill("bad_syntax.py", "def foo()\n    print('fail') GLOBAL: True")
        
        # 2. Create Structurally Bad Skill (Ruff Error - e.g. undefined variable)
        # Note: 'ruff' must be in environment for this to fail as expected
        self.create_skill("bad_structure.py", "x = y + 1\nGLOBAL: True")
        
        # 3. Create Valid Skill
        self.create_skill("good_skill.py", "def hello():\n    return 'world'\n# GLOBAL: True")

        # Mock git commands to avoid actual git errors
        synapse._git_cmd = MagicMock(return_value=(True, "", ""))
        
        # Run Push
        synapse.push()
        
        # Check Core Skills dir
        # bad_syntax.py should NOT be there
        self.assertFalse(os.path.exists(os.path.join(self.core_skills, "bad_syntax.py")), 
                         "Gatekeeper failed: Syntax error file was pushed.")
        
        # bad_structure.py should NOT be there (assuming ruff is running)
        self.assertFalse(os.path.exists(os.path.join(self.core_skills, "bad_structure.py")), 
                         "Gatekeeper failed: Structural error file was pushed.")
        
        # good_skill.py SHOULD be there
        self.assertTrue(os.path.exists(os.path.join(self.core_skills, "good_skill.py")), 
                        "Gatekeeper failed: Valid file was NOT pushed.")

        print("\n\nGatekeeper Verification Complete.")

if __name__ == "__main__":
    unittest.main()
