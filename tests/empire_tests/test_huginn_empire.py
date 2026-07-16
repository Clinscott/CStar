from pathlib import Path

from src.core.engine.wardens.huginn import HuginnWarden


def trace_root(tmp_path: Path) -> Path:
    (tmp_path / ".agents" / "traces").mkdir(parents=True)
    return tmp_path


def test_scan_no_traces(tmp_path):
    root = trace_root(tmp_path)
    assert HuginnWarden(root).scan() == []


def test_scan_regex_hallucination(tmp_path):
    root = trace_root(tmp_path)
    trace_file = root / ".agents" / "traces" / "session_hallucinate.md"
    trace_file.write_text("# Header\n# Header\n# Header\n", encoding="utf-8")
    results = HuginnWarden(root).scan()
    breach = next(item for item in results if item["type"] == "HALLUCINATION_REPEATED_HEADER")
    assert Path(breach["file"]).as_posix() == ".agents/traces/session_hallucinate.md"
    assert breach["action"] == "Repeated Markdown header detected"


def test_scan_regex_deviance(tmp_path):
    root = trace_root(tmp_path)
    trace_file = root / ".agents" / "traces" / "session_deviance.md"
    trace_file.write_text("Saving to /tmp/suspicious_file.txt", encoding="utf-8")
    results = HuginnWarden(root).scan()
    breach = next(item for item in results if item["type"] == "DEVIANCE_TEMP_PATH")
    assert "/tmp/suspicious_file.txt" in breach["action"]


def test_huginn_has_no_neural_provider_or_secret_surface(tmp_path):
    warden = HuginnWarden(trace_root(tmp_path))
    assert not hasattr(warden, "uplink")
    assert not hasattr(warden, "api_key")
    assert not hasattr(warden, "_scan_neural_async")


def test_huginn_skips_symlinked_and_oversized_traces(tmp_path):
    root = trace_root(tmp_path)
    outside = tmp_path / "outside.md"
    outside.write_text("# Secret\n# Secret\n# Secret\n", encoding="utf-8")
    (root / ".agents" / "traces" / "linked.md").symlink_to(outside)
    oversized = root / ".agents" / "traces" / "oversized.md"
    oversized.write_bytes(b"# Header\n" * (HuginnWarden.MAX_TRACE_BYTES // 5))
    assert HuginnWarden(root).scan() == []
