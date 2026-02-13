import pytest
import math
from src.sentinel.muninn import SPRTValidator

def test_sprt_validator_stable():
    # p0=0.01, p1=0.2
    validator = SPRTValidator(alpha=0.05, beta=0.1, p0=0.01, p1=0.2)
    
    # Record 20 successes
    for _ in range(20):
        validator.record_trial(success=True)
    
    # Should likely accept (stable)
    assert validator.status == "ACCEPT"

def test_sprt_validator_flaky():
    validator = SPRTValidator(alpha=0.05, beta=0.1, p0=0.01, p1=0.2)
    
    # Record failures
    for _ in range(3):
        validator.record_trial(success=False)
    
    # Should likely reject (flaky)
    assert validator.status == "REJECT"

def test_sprt_validator_continue():
    validator = SPRTValidator()
    validator.record_trial(success=True)
    assert validator.status == "CONTINUE"
