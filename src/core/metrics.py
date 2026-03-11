import json
import os
import re
import subprocess
import sys
import time
from collections.abc import Callable
from typing import Any
from pathlib import Path

from src.core.engine.atomic_gpt import AnomalyWarden
from src.core.engine.gungnir.schema import get_gungnir_overall
from src.core.prompt_linter import PromptLinter

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

    @staticmethod
    def track(name: str | None = None):
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
            with open(full_weights_path) as f:
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
        Orchestrates Radon and other checks to return the final Global Project Health Score (GPHS).
        V3: Integrates fine-grained UniversalGungnir scoring from the Chronicle state map.
        """
        structural_score = 70.0
        try:
            state_map_path = Path(project_root) / ".agents" / "skills" / "chronicle" / "state_map.json"
            if state_map_path.exists():
                state_data = json.loads(state_map_path.read_text(encoding='utf-8'))
                sectors = state_data.get("sectors", {})
                scores = []
                for sector in sectors.values():
                    if not isinstance(sector, dict):
                        continue
                    matrix = sector.get("matrix") or sector.get("gungnir")
                    if isinstance(matrix, dict):
                        scores.append(get_gungnir_overall(matrix))
                    elif "gungnir_score" in sector:
                        scores.append(float(sector.get("gungnir_score", 100) or 0))
                if scores:
                    structural_score = sum(scores) / len(scores)
        except Exception:
            pass

        # 2. Prompt Integrity (15%)
        linter = PromptLinter()
        prompt_score = linter.calculate_integrity_score()

        # 3. Cortex Alignment (15%)
        warden = AnomalyWarden()
        try:
            anomaly_prob = warden.forward([100.0, 50, 3, 0.01, 0.0])
            alignment_score = max(0, 100 * (1 - anomaly_prob))
        except Exception:
            alignment_score = 70.0

        # 4. Functional & Form (30%) - Radon Complexity
        complexity_score = 70.0
        try:
            result = subprocess.run([sys.executable, "-m", "radon", "cc", project_root, "-s", "-a"], capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                # High sensitivity: capture average complexity
                match = re.search(r'Average complexity: .*?\(([\d\.]+)\)', result.stdout)
                if match:
                    val = float(match.group(1))
                    complexity_score = max(0, 100 - (val * 10)) # Every point of complexity is -10%
        except Exception:
            pass

        final_gphs = (
            (structural_score * 0.40) +
            (prompt_score * 0.15) +
            (alignment_score * 0.15) +
            (complexity_score * 0.30)
        )

        return final_gphs
