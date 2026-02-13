import pytest
import json
import os
from pathlib import Path
from src.tools.merge_traces import _process_single_trace, _save_dataset

def test_process_single_trace():
    dataset = {"test_cases": []}
    existing_queries = {}
    trace = {"query": "hello", "match": "world", "persona": "ODIN", "is_global": True}
    
    added, updated = _process_single_trace(trace, existing_queries, dataset)
    
    assert added == 1
    assert updated == 0
    assert len(dataset["test_cases"]) == 1
    assert dataset["test_cases"][0]["query"] == "hello"
    assert dataset["test_cases"][0]["expected"] == "world"
    assert "ODIN" in dataset["test_cases"][0]["tags"]
    assert dataset["test_cases"][0]["expected_global"] is True

def test_process_single_trace_update():
    dataset = {"test_cases": [{"query": "hello", "expected": "old", "tags": ["tag1"]}]}
    existing_queries = {"hello": dataset["test_cases"][0]}
    trace = {"query": "hello", "match": "new", "persona": "ALFRED"}
    
    added, updated = _process_single_trace(trace, existing_queries, dataset)
    
    assert added == 0
    assert updated == 1
    assert dataset["test_cases"][0]["expected"] == "new"
    assert "ALFRED" in dataset["test_cases"][0]["tags"]
    assert "tag1" in dataset["test_cases"][0]["tags"]

def test_save_dataset_atomic(tmp_path):
    target = tmp_path / "data.json"
    dataset = {"test": 123}
    
    success = _save_dataset(dataset, target)
    assert success is True
    assert target.exists()
    
    with open(target, 'r') as f:
        loaded = json.load(f)
        assert loaded["test"] == 123
