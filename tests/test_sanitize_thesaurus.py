from src.tools.data.sanitize_thesaurus import sanitize_clusters


def test_sanitize_clusters_logic():
    """Verifies the inversion logic of the thesaurus sanitizer."""
    mock_clusters = {
        "start": ["begin", "initiate"],
        "finish": ["end", "done"]
    }

    inverted = sanitize_clusters(mock_clusters)

    # "begin" should have "start" and "initiate" as synonyms
    assert "begin" in inverted
    assert "start" in inverted["begin"]
    assert "initiate" in inverted["begin"]
    assert "begin" not in inverted["begin"] # Should not be its own synonym

def test_sanitize_file_operation(tmp_path):
    """Verifies that the sanitizer writes a valid markdown file."""
    output_file = tmp_path / "thesaurus.md"
    mock_clusters = {"test": ["exam", "trial"]}

    from src.tools.data.sanitize_thesaurus import write_thesaurus
    write_thesaurus(mock_clusters, output_file)

    assert output_file.exists()
    content = output_file.read_text(encoding='utf-8')
    assert "## 🌊 Expanded Intent Clusters" in content
    assert "- **test**: exam, trial" in content
