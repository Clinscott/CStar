import pytest
import sys
from pathlib import Path
from src.sentinel._bootstrap import PROJECT_ROOT, bootstrap

def test_project_root():
    # PROJECT_ROOT should point to the CorvusStar root
    assert (PROJECT_ROOT / "src").exists()
    assert (PROJECT_ROOT / "tests").exists()

def test_bootstrap_idempotency():
    # First call
    bootstrap()
    assert str(PROJECT_ROOT) in sys.path
    
    # Second call (should return early)
    bootstrap()
    assert str(PROJECT_ROOT) in sys.path
