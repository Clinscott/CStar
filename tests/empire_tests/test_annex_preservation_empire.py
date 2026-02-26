from src.core.annex import HeimdallWarden


def test_annex_preservation_checkmarks(tmp_path):
    """
    Verifies that HeimdallWarden preserves [x] checkmarks in the plan.
    """
    root = tmp_path
    plan_path = root / "ANNEXATION_PLAN.qmd"

    # 1. Create a dummy breach file
    dummy_file = root / "missing_test.py"
    dummy_file.write_text("print('hello')", encoding="utf-8")

    # 2. Run initial scan
    warden = HeimdallWarden(root)
    # Mock _should_ignore to ensure dummy_file is NOT ignored
    warden._should_ignore = lambda p: False if p.name == "missing_test.py" else True

    warden.scan()
    assert plan_path.exists()
    content = plan_path.read_text(encoding="utf-8")
    assert "- [ ] **[MISSING TEST]** `missing_test.py`" in content

    # 3. Manually mark it as [x]
    marked_content = content.replace("- [ ] **[MISSING TEST]** `missing_test.py`内容", "- [x] **[MISSING TEST]** `missing_test.py`")
    # Actually just replace the checkmark
    marked_content = content.replace("- [ ] **[MISSING TEST]** `missing_test.py`", "- [x] **[MISSING TEST]** `missing_test.py`")
    plan_path.write_text(marked_content, encoding="utf-8")

    # 4. Run scan again
    warden2 = HeimdallWarden(root)
    warden2._should_ignore = lambda p: False if p.name == "missing_test.py" else True
    warden2.scan()

    # 5. Verify [x] is preserved
    new_content = plan_path.read_text(encoding="utf-8")
    assert "- [x] **[MISSING TEST]** `missing_test.py`" in new_content
