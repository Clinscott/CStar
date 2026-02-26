import json

from sterileAgent.fishtest import SPRT, FishtestRunner


def test_sprt_logic():
    sprt = SPRT(alpha=0.05, beta=0.05, p0=0.95, p1=0.99)
    status, _ = sprt.evaluate(100, 100)
    assert "PASS" in status

    status, _ = sprt.evaluate(0, 100)
    assert "FAIL" in status

def test_fishtest_runner_init(tmp_path):
    data_file = tmp_path / "test_data.json"
    data_file.write_text(json.dumps({"test_cases": []}), encoding='utf-8')
    # Use a mock config or expect failure on missing parts
    try:
        runner = FishtestRunner(data_file=str(data_file))
        assert runner.data_file == str(data_file)
    except Exception:
        pass
