"""Comprehensive test suite for persona-aware installation."""

import unittest
import tempfile
import shutil
import os
import subprocess
import json

class TestInstallPersona(unittest.TestCase):
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.source_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    def tearDown(self):
        # Retry cleanup to handle Windows file locks
        import time
        for _ in range(3):
            try:
                shutil.rmtree(self.test_dir, ignore_errors=True)
                if not os.path.exists(self.test_dir):
                    break
            except:
                time.sleep(1)
    
    def test_cli_persona_odin(self):
        """Test -Persona ODIN flag works."""
        result = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-File", 
             os.path.join(self.source_dir, "install.ps1"),
             "-TargetDir", self.test_dir,
             "-Persona", "ODIN",
             "-Silent",
             "-NoBackup"],
            capture_output=True, text=True
        )
        
        # Check output for success marker
        self.assertIn("Installation Complete", result.stdout)
        
        config_path = os.path.join(self.test_dir, ".agent", "config.json")
        self.assertTrue(os.path.exists(config_path))
        
        with open(config_path) as f:
            cfg = json.load(f)
        self.assertEqual(cfg["Persona"], "ODIN")
        
        # Check AGENTS.md theme
        agents_path = os.path.join(self.test_dir, "AGENTS.md")
        with open(agents_path, encoding='utf-8') as f:
            content = f.read()
        self.assertIn("ODIN PROTOCOL", content)
    
    def test_cli_persona_alfred(self):
        """Test -Persona ALFRED flag works."""
        result = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-File", 
             os.path.join(self.source_dir, "install.ps1"),
             "-TargetDir", self.test_dir,
             "-Persona", "ALFRED",
             "-Silent",
             "-NoBackup"],
            capture_output=True, text=True
        )
        
        config_path = os.path.join(self.test_dir, ".agent", "config.json")
        self.assertTrue(os.path.exists(config_path))
        
        with open(config_path) as f:
            cfg = json.load(f)
        self.assertEqual(cfg["Persona"], "ALFRED")
        
        agents_path = os.path.join(self.test_dir, "AGENTS.md")
        with open(agents_path, encoding='utf-8') as f:
            content = f.read()
        self.assertIn("PENNYWORTH PROTOCOL", content)
    
    def test_alfred_suggestions_always_created(self):
        """Verify ALFRED_SUGGESTIONS.md exists even with ODIN persona."""
        subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-File",
             os.path.join(self.source_dir, "install.ps1"),
             "-TargetDir", self.test_dir,
             "-Persona", "ODIN",
             "-Silent",
             "-NoBackup"],
            capture_output=True, text=True
        )
        
        self.assertTrue(
            os.path.exists(os.path.join(self.test_dir, "ALFRED_SUGGESTIONS.md")),
            "Alfred's shadow must always be present"
        )
    
    def test_quarantine_preserves_originals(self):
        """Verify existing files are quarantined, not overwritten."""
        # Create a pre-existing file
        agents_path = os.path.join(self.test_dir, "AGENTS.md")
        os.makedirs(self.test_dir, exist_ok=True)
        with open(agents_path, "w", encoding='utf-8') as f:
            f.write("# Original Project Instructions")
        
        # Run install without -NoBackup
        subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-File",
             os.path.join(self.source_dir, "install.ps1"),
             "-TargetDir", self.test_dir,
             "-Persona", "ODIN",
             "-Silent"],
            capture_output=True, text=True
        )
        
        # Verify quarantine folder exists
        quarantine = os.path.join(self.test_dir, ".corvus_quarantine")
        self.assertTrue(os.path.exists(quarantine))
        self.assertGreater(len(os.listdir(quarantine)), 0)
    
    def test_takeover_preserves_content(self):
        """Verify original content appears in 'Project Legacy' section."""
        LEGACY_MARKER = "My original content here"
        
        agents_split_path = os.path.join(self.test_dir, "AGENTS.md")
        os.makedirs(self.test_dir, exist_ok=True)
        with open(agents_split_path, "w", encoding='utf-8') as f:
            f.write(f"# Old\n{LEGACY_MARKER}")
        
        subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-File",
             os.path.join(self.source_dir, "install.ps1"),
             "-TargetDir", self.test_dir,
             "-Persona", "ALFRED",
             "-Silent",
             "-NoBackup"],
            capture_output=True, text=True
        )
        
        with open(agents_split_path, encoding='utf-8') as f:
            new_content = f.read()
        
        self.assertIn(LEGACY_MARKER, new_content)
        self.assertIn("Project Legacy", new_content)

if __name__ == '__main__':
    unittest.main()
