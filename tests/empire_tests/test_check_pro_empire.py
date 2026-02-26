from unittest.mock import MagicMock, call, patch

# Import the refactored script to test its main function
from src.tools.debug import check_pro
import pytest


# Define a custom exception to simulate specific API errors during testing
class MockGoogleAPIError(Exception):
    pass

@patch('src.tools.debug.check_pro.os.getenv')
@patch('src.tools.debug.check_pro.genai.Client')
def test_script_checks_model_availability(mock_genai_client_class, mock_getenv, capsys):
    """
    Tests the check_pro script's main execution flow against the Gherkin scenario.

    - GIVEN: The script has a valid Google API key configured (mocked).
    - WHEN: The script is executed by calling its main() function.
    - THEN: It initializes the genai client, attempts to generate content
      with each model, and reports the outcome as specified.
    """
    # GIVEN: The script has access to a valid, mocked Google API key.
    mock_getenv.return_value = "DUMMY_API_KEY_FOR_TESTING"

    # GIVEN: The google.genai.Client is mocked to control its behavior
    # and prevent actual network calls.
    mock_client_instance = MagicMock()

    # Configure the mock to simulate one model failing, to test both outcomes.
    # The side_effect list maps directly to the `candidates` list in the script.
    mock_client_instance.models.generate_content.side_effect = [
        MagicMock(text="Success response 1"),       # SUCCESS for the first model
        MockGoogleAPIError("Model not found"), # FAILED for the second model
        MagicMock(text="Success response 3")        # SUCCESS for the third model
    ]
    mock_genai_client_class.return_value = mock_client_instance

    # WHEN: The script's main function is executed.
    check_pro.main()

    # THEN: The script initializes the google.genai client.
    captured = capsys.readouterr()
    output = captured.out

    mock_genai_client_class.assert_called_once_with(api_key="DUMMY_API_KEY_FOR_TESTING")
    assert "Initializing google.genai Client..." in output

    # AND: The script attempts to generate content with each model in the candidate list.
    expected_candidates = ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.0-flash-lite-preview-02-05"]
    expected_calls = [
        call(model=model_name, contents="Hello, are you online?")
        for model_name in expected_candidates
    ]
    assert mock_client_instance.models.generate_content.call_count == len(expected_candidates)
    mock_client_instance.models.generate_content.assert_has_calls(expected_calls, any_order=False)

    # AND: For each model, the script prints either "SUCCESS" or "FAILED".
    # We check the full output lines for accuracy.
    output_lines = [line.strip() for line in output.strip().split('\n')]
    assert f"Testing {expected_candidates[0]}... SUCCESS" in output_lines
    assert f"Testing {expected_candidates[1]}... FAILED (Model not found)" in output_lines
    assert f"Testing {expected_candidates[2]}... SUCCESS" in output_lines

@patch('src.tools.debug.check_pro.os.getenv')
@patch('src.tools.debug.check_pro.genai.Client')
def test_script_exits_when_no_api_key(mock_genai_client_class, mock_getenv, capsys):
    """
    Tests the precondition from the Gherkin scenario that a valid API key is configured.
    This test verifies the script's behavior when the key is missing.
    """
    # GIVEN: The Google API key is not configured.
    mock_getenv.return_value = None

    # WHEN: The script is executed.
    return_code = check_pro.main()

    # THEN: The script should report the error and exit with a non-zero status.
    captured = capsys.readouterr()
    assert "API Key not found" in captured.out
    assert return_code == 1
    mock_genai_client_class.assert_not_called()
