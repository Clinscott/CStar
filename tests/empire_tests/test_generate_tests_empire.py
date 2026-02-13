import pytest
from src.tools.generate_tests import generate_cases

def test_generate_cases_basic():
    n = 100
    data = generate_cases(n=n)
    
    assert data["baseline_accuracy"] == 100.0
    assert len(data["test_cases"]) == n
    
    # Check structure of a test case
    case = data["test_cases"][0]
    assert "query" in case
    assert "expected" in case
    assert "min_score" in case
    assert "tags" in case
    
    # Check expected intents are valid
    valid_intents = {"/lets-go", "/run-task", "/investigate", "/wrap-it-up"}
    for case in data["test_cases"]:
        assert case["expected"] in valid_intents
