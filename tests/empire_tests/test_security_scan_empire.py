from src.tools.security_scan import SecurityScanner


def test_security_scanner_dangerous_code(tmp_path):
    f = tmp_path / "evil.py"
    f.write_text("import os\nos.system('rm -rf /')\neval('1+1')", encoding='utf-8')

    scanner = SecurityScanner(str(f))
    is_safe, findings = scanner.scan()

    assert is_safe is False
    assert scanner.threat_score >= 10
    # Findings contain the regex pattern which includes backslashes
    assert any("os" in f and "system" in f for f in findings)
    assert any("eval" in f for f in findings)

def test_security_scanner_obfuscation(tmp_path):
    f = tmp_path / "obf.py"
    # Large base64-like string
    long_b64 = "A" * 210
    f.write_text(f"x = '{long_b64}'", encoding='utf-8')

    scanner = SecurityScanner(str(f))
    _is_safe, findings = scanner.scan()

    assert any("OBFUSCATION" in f for f in findings)

def test_security_scanner_safe(tmp_path):
    f = tmp_path / "safe.py"
    f.write_text("def hello():\n    print('hi')", encoding='utf-8')

    scanner = SecurityScanner(str(f))
    is_safe, _findings = scanner.scan()

    assert is_safe is True
    assert scanner.threat_score == 0
