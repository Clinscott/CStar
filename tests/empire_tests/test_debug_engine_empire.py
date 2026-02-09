import io
import os
import sys
from contextlib import redirect_stdout
from unittest.mock import patch

import pytest

# Ensure the script's directory is in the Python path
SCRIPT_DIR = os.path.join(os.getcwd())
sys.path.insert(0, SCRIPT_DIR)

# Import the module to be tested
import debug_engine
from sv_engine import SovereignVector

# Mock data - replace with actual paths if needed for a full integration test
THESAURUS_PATH = 'thesaurus.qmd'
CORRECTIONS_PATH = os.path.join(SCRIPT_DIR, '.agent', 'corrections.json')
STOPWORDS_PATH = os.path.join(SCRIPT_DIR, '.agent', 'scripts', 'stopwords.json')
SKILLS_DIR = os.path.join(SCRIPT_DIR, '.agent', 'skills')
GLOBAL_SKILLS_DIR = os.path.join(SCRIPT_DIR, 'skills_db')

@pytest.fixture
def mock_engine():
    with patch('debug_engine.SovereignVector') as MockEngine:
        mock_engine_instance = MockEngine.return_value
        mock_engine_instance.thesaurus = {
            'begin': ['start'],
            'initiate': ['begin', 'start'],
            'aesthetics': ['beauty'],
            'e2e': ['end-to-end']
        }
        mock_engine_instance.tokenize.return_value = ['please', 'initiate', 'project', 'now']
        mock_engine_instance.expand_query.return_value = {
            'please': 0.1, 'initiate': 0.5, 'project': 0.8, 'now': 0.2
        }
        mock_engine_instance.search.return_value = [
            {'trigger': 'skill1', 'score': 0.95, 'is_global': True},
            {'trigger': 'skill2', 'score': 0.80, 'is_global': False},
            {'trigger': 'skill3', 'score': 0.70, 'is_global': True},
            {'trigger': 'skill4', 'score': 0.60, 'is_global': False},
            {'trigger': 'skill5', 'score': 0.50, 'is_global': True}
        ]
        yield mock_engine_instance


def test_basic_query_processing(mock_engine, monkeypatch):
    captured_output = io.StringIO()
    monkeypatch.setattr('sys.stdout', captured_output)
    
    query = "please initiate our project now"
    debug_engine.debug_query(query)
    
    output = captured_output.getvalue()
    
    assert "--- Thesaurus Check ---" in output
    assert "--- Debugging Query: 'please initiate our project now' ---" in output
    assert "Tokens: ['please', 'initiate', 'project', 'now']" in output
    assert "Top 10 Expanded Tokens: [('project', 0.8), ('initiate', 0.5), ('now', 0.2), ('please', 0.1)]" in output
    assert "Top 5 Results:" in output
    assert "skill1: 0.9500 (Global: True)" in output
    assert "skill2: 0.8000 (Global: False)" in output


def test_thesaurus_loading(mock_engine, monkeypatch):
    captured_output = io.StringIO()
    monkeypatch.setattr('sys.stdout', captured_output)

    query = "test query"
    debug_engine.debug_query(query)

    output = captured_output.getvalue()

    assert "begin: ['start']" in output
    assert "initiate: ['begin', 'start']" in output
    assert "aesthetics: ['beauty']" in output
    assert "e2e: ['end-to-end']" in output

def test_tokenization_output(mock_engine, monkeypatch):
    captured_output = io.StringIO()
    monkeypatch.setattr('sys.stdout', captured_output)

    query = "please initiate our project now"
    debug_engine.debug_query(query)

    output = captured_output.getvalue()
    assert "Tokens: ['please', 'initiate', 'project', 'now']" in output


def test_search_results_output(mock_engine, monkeypatch):
    captured_output = io.StringIO()
    monkeypatch.setattr('sys.stdout', captured_output)

    query = "test query"
    debug_engine.debug_query(query)

    output = captured_output.getvalue()

    assert "Top 5 Results:" in output
    assert "skill1: 0.9500 (Global: True)" in output
    assert "skill2: 0.8000 (Global: False)" in output
    assert "skill3: 0.7000 (Global: True)" in output
    assert "skill4: 0.6000 (Global: False)" in output
    assert "skill5: 0.5000 (Global: True)" in output