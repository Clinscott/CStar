import pytest
import json
from pathlib import Path
from src.core.sterling_auditor import SterlingAuditor

@pytest.fixture
def auditor(tmp_path):
    # Setup a mock project structure
    (tmp_path / "tests" / "features").mkdir(parents=True)
    (tmp_path / "tests" / "unit").mkdir(parents=True)
    (tmp_path / "tests" / "node").mkdir(parents=True)
    (tmp_path / "tests" / "empire_tests").mkdir(parents=True)
    (tmp_path / "src" / "core").mkdir(parents=True)
    
    return SterlingAuditor(tmp_path)

def test_audit_file_tarnished(auditor, tmp_path):
    file_path = tmp_path / "src" / "core" / "new_file.py"
    file_path.write_text("print('hello')")
    
    report = auditor.audit_file(str(file_path))
    
    assert report["status"] == "TARNISHED"
    assert report["compliance_score"] == 0.0
    assert report["tiers"]["tier1_lore"]["status"] == "MISSING"
    assert report["tiers"]["tier2_isolation"]["status"] == "MISSING"

def test_audit_file_silver(auditor, tmp_path):
    # 1. Create source
    file_path = tmp_path / "src" / "core" / "gold.py"
    file_path.write_text("def gold(): pass")
    
    # 2. Create Tier 1 (Lore)
    feature_path = tmp_path / "tests" / "features" / "gold.feature"
    feature_path.write_text("Feature: Gold")
    
    # 3. Create Tier 2 (Isolation)
    test_path = tmp_path / "tests" / "unit" / "test_gold.py"
    test_path.write_text("def test_gold(): pass")
    
    # 4. Create Tier 3 (Audit)
    empire_path = tmp_path / "tests" / "empire_tests" / "test_gold_empire.py"
    empire_path.write_text("assert 'gold.py' in 'gold.py'")
    
    report = auditor.audit_file(str(file_path))
    
    assert report["status"] == "SILVER"
    assert report["compliance_score"] == 100.0
    assert report["tiers"]["tier1_lore"]["status"] == "SILVER"
    assert report["tiers"]["tier2_isolation"]["status"] == "SILVER"
    assert report["tiers"]["tier3_audit"]["status"] == "SILVER"

def test_audit_file_polished(auditor, tmp_path):
    file_path = tmp_path / "src" / "core" / "silver.py"
    file_path.write_text("def silver(): pass")
    
    # Only Tier 1 and 2
    (tmp_path / "tests" / "features" / "silver.feature").write_text("Feature: Silver")
    (tmp_path / "tests" / "unit" / "test_silver.py").write_text("def test_silver(): pass")
    
    report = auditor.audit_file(str(file_path))
    
    assert report["status"] == "POLISHED"
    assert report["compliance_score"] == pytest.approx(66.6, 0.1)
