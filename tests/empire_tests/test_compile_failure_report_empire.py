import pytest
import os
from src.tools.compile_failure_report import compile_report

def test_compile_report_categorization(tmp_path):
    # Setup mock structure
    agent_dir = tmp_path / ".agent"
    traces_dir = agent_dir / "traces" / "quarantine"
    traces_dir.mkdir(parents=True)
    
    rej_file = traces_dir / "REJECTIONS.qmd"
    rej_file.write_text("- [REJECT] latency spike\n- [REJECT] conflict in git\n- [REJECT] low score\n", encoding='utf-8')
    
    # Run compile_report (it prints, so we just verify it doesn't crash)
    compile_report(str(tmp_path))
    
    # Since it uses a global UI object for logging, we mostly check it handles the file presence correctly.
    # In a real scenario, we'd mock SovereignHUD if we wanted to verify counts.
