
from unittest.mock import mock_open, patch

import pytest

from src.core.prompt_linter import PromptLinter


class TestPromptLinterEmpire:

    @patch("src.core.prompt_linter.os.path.exists", return_value=True)
    @patch("src.core.prompt_linter.open", new_callable=mock_open, read_data="Hello {{name}}, welcome to {{location}}!")
    def test_parse_prompty_vars(self, mock_file, mock_exists):
        linter = PromptLinter()
        vars = linter.parse_prompty_vars("fake.prompty")
        assert "name" in vars
        assert "location" in vars
        assert len(vars) == 2

    @patch("src.core.prompt_linter.os.path.exists", return_value=True)
    def test_audit_python_invocation_dict(self, mock_exists):
        linter = PromptLinter()

        # Case 1: Dict usage
        code_dict = "data = {'name': 'Alice', 'location': 'Wonderland'}"
        with patch("src.core.prompt_linter.open", mock_open(read_data=code_dict)):
            assert linter.audit_python_invocation("script.py", ["name", "location"]) == True

        # Case 2: Missing var
        code_missing = "data = {'name': 'Alice'}"
        with patch("src.core.prompt_linter.open", mock_open(read_data=code_missing)):
            assert linter.audit_python_invocation("script.py", ["name", "location"]) == False

    @patch("src.core.prompt_linter.os.path.exists", return_value=True)
    def test_audit_python_invocation_kwargs(self, mock_exists):
        linter = PromptLinter()

        # Case 3: Keyword args
        code_kw = "func(name='Alice', location='Wonderland')"
        with patch("src.core.prompt_linter.open", mock_open(read_data=code_kw)):
            assert linter.audit_python_invocation("script.py", ["name", "location"]) == True

    @patch("src.core.prompt_linter.os.path.exists", return_value=True)
    def test_audit_python_invocation_format(self, mock_exists):
        linter = PromptLinter()

        # Case 4: String format
        code_fmt = "'Hello {name}'.format(name='Alice', location='Wonderland')"
        with patch("src.core.prompt_linter.open", mock_open(read_data=code_fmt)):
            assert linter.audit_python_invocation("script.py", ["name", "location"]) == True

    @patch("src.core.prompt_linter.os.path.exists")
    @patch("src.core.prompt_linter.os.listdir")
    def test_calculate_integrity_score(self, mock_listdir, mock_exists):
        linter = PromptLinter()

        # Case 1: No dir
        mock_exists.return_value = False
        assert linter.calculate_integrity_score("dummy") == 0.0

        # Case 2: Empty dir
        mock_exists.return_value = True
        mock_listdir.return_value = []
        assert linter.calculate_integrity_score("dummy") == 0.0

        # Case 3: Mixed files
        mock_listdir.return_value = ["a.prompty", "b.prompty", "c.txt"]

        # parse_prompty_vars is called for each .prompty
        with patch.object(linter, 'parse_prompty_vars') as mock_parse:
            mock_parse.return_value = ["var1"] # Always valid

            # total_prompts = 2
            # valid_prompts = 2 (since parse returns list, not None)
            # score = 100.0

            score = linter.calculate_integrity_score("dummy")
            assert score == 100.0

if __name__ == "__main__":
    pytest.main([__file__])
