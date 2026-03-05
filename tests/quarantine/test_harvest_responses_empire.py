import json
from unittest.mock import MagicMock

from src.sentinel.harvest_responses import ResponseRecorder


def test_response_recorder_calls():
    real_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Hello World"
    real_client.models.generate_content.return_value = mock_response

    recorder = ResponseRecorder(real_client)

    # Mock the call
    res = recorder.record_call(model="gemini-2.0-flash", contents="Hi")

    assert res.text == "Hello World"
    assert len(recorder.recordings) == 1
    assert recorder.recordings[0]["response_text"] == "Hello World"
    assert recorder.recordings[0]["success"] is True

def test_response_recorder_save(tmp_path):
    real_client = MagicMock()
    recorder = ResponseRecorder(real_client)
    recorder.recordings = [{"test": "data"}]

    out_path = tmp_path / "mock.json"
    recorder.save(out_path)

    assert out_path.exists()
    data = json.loads(out_path.read_text(encoding='utf-8'))
    assert data[0]["test"] == "data"
