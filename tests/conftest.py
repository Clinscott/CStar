"""Shared fixtures for sentinel tests."""
import os
import pytest
from pathlib import Path
from unittest.mock import MagicMock


@pytest.fixture
def mock_genai_client():
    """Provides a mock Gemini client that doesn't require API keys."""
    client = MagicMock()
    # Default: generate_content returns a mock with .text
    response = MagicMock()
    response.text = '{"status": "APPROVED", "reason": "Looks good."}'
    client.models.generate_content.return_value = response
    return client


@pytest.fixture
def temp_project(tmp_path):
    """Creates a minimal project directory for testing."""
    (tmp_path / "src").mkdir()
    (tmp_path / "tests").mkdir()
    (tmp_path / ".agent").mkdir()
    # Create a simple Python file to scan
    sample = tmp_path / "src" / "sample.py"
    sample.write_text("def hello():\n    print('hi')\n", encoding="utf-8")
    return tmp_path
