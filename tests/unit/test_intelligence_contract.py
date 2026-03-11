from src.core.intelligence_contract import (
    build_intelligence_success,
    normalize_intelligence_request,
    parse_structured_payload,
)


def test_parse_structured_payload_extracts_json_from_text():
    parsed = parse_structured_payload('Oracle reply:\n{"status":"ok","score":91}\nProceed.')
    assert parsed == {"status": "ok", "score": 91}


def test_build_intelligence_success_returns_trace_and_parsed_data():
    request = normalize_intelligence_request(
        {
            "prompt": "Return JSON only.",
            "correlation_id": "corr-1",
        },
        default_source="test-suite",
    )

    response = build_intelligence_success(
        request,
        '{"status":"ok","answer":"aligned"}',
        "host_session",
    )

    assert response.status == "success"
    assert response.parsed_data == {"status": "ok", "answer": "aligned"}
    assert response.trace.correlation_id == "corr-1"
    assert response.trace.transport_mode == "host_session"
    assert response.trace.cached is False
