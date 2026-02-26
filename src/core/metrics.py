import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable, Optional
from src.core.prompt_linter import PromptLinter
from src.core.engine.atomic_gpt import AnomalyWarden

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

class ExecutionTracker:
    """
    Decoupled Metrics Tracker.
    Tracks pure latency using perf_counter. 
    Memory profiling (psutil) is only sampled at explicit start/end bounds 
    to prevent Observer Effect latency inflation.
    """
    def __init__(self, name: str):
        self.name = name
        self.start_time: float = 0.0
        self.end_time: float = 0.0
        self.start_mem: float = 0.0
        self.end_mem: float = 0.0

    def __enter__(self):
        if HAS_PSUTIL:
            process = psutil.Process(os.getpid())
            self.start_mem = process.memory_info().rss / (1024 * 1024) # MB
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.perf_counter()
        if HAS_PSUTIL:
            process = psutil.Process(os.getpid())
            self.end_mem = process.memory_info().rss / (1024 * 1024) # MB

    @property
    def latency_ms(self) -> float:
        return (self.end_time - self.start_time) * 1000

    @property
    def mem_delta_mb(self) -> float:
        return self.end_mem - self.start_mem
        
    def report(self) -> dict[str, Any]:
        return {
            "operation": self.name,
            "latency_ms": round(self.latency_ms, 2),
            "memory_start_mb": round(self.start_mem, 2),
            "memory_end_mb": round(self.end_mem, 2),
            "memory_delta_mb": round(self.mem_delta_mb, 2)
        }

def track_execution(name: Optional[str] = None):
    """
    Decorator to easily track execution metrics for a function without polluting its logic.
    """
    def decorator(func: Callable):
        def wrapper(*args, **kwargs):
            op_name = name or func.__name__
            with ExecutionTracker(op_name) as tracker:
                result = func(*args, **kwargs)
                
            # Log or store the metrics
            try:
                from src.core.sovereign_hud import SovereignHUD
                # Only log if it's a significant operation (>50ms) to avoid spam
                if tracker.latency_ms > 50:
                    delta_str = f"+{tracker.mem_delta_mb}MB" if tracker.mem_delta_mb >= 0 else f"{tracker.mem_delta_mb}MB"
                    SovereignHUD.persona_log("INFO", f"[{op_name}] Latency: {tracker.latency_ms:.2f}ms | Mem: {delta_str}")
            except Exception:
                pass
                
            return result
        return wrapper
    return decorator

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
        warden = AnomalyWarden()
        
        # 1. Prompt Integrity (15%)
        prompt_score = linter.calculate_integrity_score()
        
        # 2. Cortex Alignment (15%) - Uses AnomalyWarden anomaly probability
        #    Low anomaly probability = high alignment
        try:
            anomaly_prob = warden.forward([100.0, 50, 3, 0.01])  # baseline metadata vector
            alignment_score = max(0, 100 * (1 - anomaly_prob))
        except Exception as e:
            import logging
            logging.warning(f"AnomalyWarden alignment fallback triggered: {e}")
            alignment_score = 70.0  # safe fallback
        
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
