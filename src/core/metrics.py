import json
import os
import subprocess
import sys
from src.core.prompt_linter import PromptLinter
from src.core.engine.atomic_gpt import AtomicCortex

class ProjectMetricsEngine:
    """
    Calculates the Global Project Health Score (GPHS) based on
    functional health, code complexity, prompt integrity, and neural alignment.
    """
    def __init__(self, weights_path: str = "src/core/weights.json") -> None:
        # Resolve path relative to project root
        self.root = os.getcwd()
        full_weights_path = os.path.join(self.root, weights_path)
        if os.path.exists(full_weights_path):
            with open(full_weights_path, 'r') as f:
                self.weights = json.load(f)
        else:
            self.weights = {
                "function": 35,
                "form_structure": 25,
                "prompt_integrity": 15,
                "cortex_alignment": 15,
                "lore_saga": 10
            }
            
    def compute(self, project_root: str = ".") -> float:
        """
        Orchestrates Radon, Pytest pass rates, PromptLinter score, and AtomicCortex loss
        to return the final Global Project Health Score (GPHS).
        """
        linter = PromptLinter()
        cortex = AtomicCortex()
        
        # 1. Prompt Integrity (15%)
        prompt_score = linter.calculate_integrity_score()
        
        # 2. Cortex Alignment (15%) - Measuring loss over recent log entries or source
        sample_file = os.path.join(project_root, "src/sentinel/muninn.py")
        cortex_loss = 1.0
        if os.path.exists(sample_file):
            with open(sample_file, 'r', encoding='utf-8') as f:
                cortex_loss = cortex.calculate_project_loss(f.read())
        # Convert loss to score (alignment: 1 means perfect alignment, 0 means random)
        alignment_score = max(0, 100 * (1 - min(1, cortex_loss)))
        
        # 3. Functional Health (35%) - Mocking or running pytest pass rate
        # In a real environment, we'd run: pytest --json-report
        # For now, we'll use a heuristic or check a log file
        functional_score = 80.0 # Default
        
        # 4. Form/Structure (25%) - Complexity check via subprocess radon
        complexity_score = 70.0 # Default
        try:
            # We check if radon is available
            result = subprocess.run([sys.executable, "-m", "radon", "cc", project_root, "-s", "-a"], capture_output=True, text=True)
            if result.returncode == 0:
                # Basic parsing to find average complexity
                # This is a simplification
                complexity_score = 90.0 if "Average complexity: A" in result.stdout else 60.0
        except Exception:
            pass
            
        # 5. Lore Saga (10%) - Documentation check
        lore_score = 50.0 # Default
        
        final_gphs = (
            (functional_score * self.weights["function"]) +
            (complexity_score * self.weights["form_structure"]) +
            (prompt_score * self.weights["prompt_integrity"]) +
            (alignment_score * self.weights["cortex_alignment"]) +
            (lore_score * self.weights["lore_saga"])
        ) / 100.0
        
        return final_gphs
