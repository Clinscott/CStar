import json
import os
import sys
from contextlib import redirect_stdout
from io import StringIO

import pytest

# Add the script's directory to the path
sys.path.insert(0, '.')
sys.path.insert(0, '.agent/scripts')

# Mock the SovereignVector class and its methods
class MockSovereignVector:
    def __init__(self, thesaurus_path, corrections_path, stopwords_path):
        pass

    def load_core_skills(self):
        pass

    def build_index(self):
        pass

    def search(self, query):
        if query == "部署":
            return [{'score': 0.95, 'trigger': 'deploy_command'}]
        elif query == "不存在的词语":
            return None
        else:
            return []

# Replace the actual SovereignVector with the mock
sys.modules['engine'] = type('engine', (object,), {})
sys.modules['engine.vector'] = type('engine.vector', (object,), {'SovereignVector': MockSovereignVector})

# Import the script after mocking
import cjk_check


@pytest.fixture
def mock_sovereign_vector():
    return MockSovereignVector('thesaurus.qmd', '.agent/corrections.json', '.agent/scripts/stopwords.json')


def test_successful_cjk_query(mock_sovereign_vector, monkeypatch):
    # Mock the print function to capture output
    captured_output = StringIO()
    monkeypatch.setattr('sys.stdout', captured_output)

    # Call the function
    result = cjk_check.search_and_print("部署")

    # Assertions
    assert result['query'] == "部署"
    assert result['score'] == 0.95
    assert result['trigger'] == "deploy_command"
    assert "Query: 部署" in captured_output.getvalue()
    assert "Score: 0.9500" in captured_output.getvalue()
    assert "Trigger: deploy_command" in captured_output.getvalue()


def test_no_results_for_cjk_query(mock_sovereign_vector, monkeypatch):
    # Mock the print function to capture output
    captured_output = StringIO()
    monkeypatch.setattr('sys.stdout', captured_output)

    # Call the function
    result = cjk_check.search_and_print("不存在的词语")

    # Assertions
    assert result['query'] == "不存在的词语"
    assert result['result'] == "No results"
    assert "Query: 不存在的词语 -> No results" in captured_output.getvalue()