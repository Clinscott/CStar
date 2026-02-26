from src.tools.lightning_rod import optimize_file


def test_optimize_file_signature(tmp_path):
    test_file = tmp_path / "test_opt.py"
    test_file.write_text("print('hello')", encoding='utf-8')

    # Run optimization
    optimize_file(str(test_file))

    content = test_file.read_text(encoding='utf-8')
    assert "print('hello')" in content
    assert "# Optimized by Agent Lightning" in content

def test_optimize_file_idempotent(tmp_path):
    test_file = tmp_path / "test_opt_twice.py"
    test_file.write_text("print('hello')\n\n# Optimized by Agent Lightning", encoding='utf-8')

    # Run optimization again
    optimize_file(str(test_file))

    content = test_file.read_text(encoding='utf-8')
    # Count occurrences
    assert content.count("# Optimized by Agent Lightning") == 1
