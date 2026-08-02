from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs" / "reports" / "cstar-automatic-machinery-provenance-20260802.md"
BASE_COMMIT = "5887042deefaae240db2a546f3cc9640f601e9e2"
ALLOWLIST = {
    "docs/reports/cstar-automatic-machinery-provenance-20260802.md",
    "tests/contracts/test_cstar_automatic_adoption_provenance.py",
}
DONOR_EVIDENCE = {
    "src/tools/cstar-kernel-mcp/tools/codex_request_identity.ts": {
        "base_blob_sha1": "ea7338727cecfa4ed32388635da5c7bbb8c73f99",
        "donor_blob_sha1": "3f07b3523abe9c8af7148302c42cb3fda2c9ce58",
        "donor_sha256": "31612c20fc80c9ed954eca4153d4095a45fe87dd4d21e55eef6829bc1357d34d",
        "patch_sha256": "16b4f58f1f0662769345a512c4635dbe0629620121350ddf4d16d0c83d2ca0cd",
    },
    "src/tools/cstar-kernel-mcp/tools/codex_session_append_retry.ts": {
        "base_blob_sha1": None,
        "donor_blob_sha1": "da9d51f412cebae0bae376f10b6547c2f478c278",
        "donor_sha256": "e99b97549569c48b9fc93d47a7a8883efb60284924baf5fb0caa0cd3326e7e54",
        "patch_sha256": "23e4d18a7be16b7dad255ec2919bee38e8fce3a6d5a3fe434c7ae5d4cfcf4584",
    },
    "src/tools/cstar-kernel-mcp/tools/codex_session_authority_projection.ts": {
        "base_blob_sha1": "f863a28f8e0813929fd6703e1fcae8f581616d46",
        "donor_blob_sha1": "3f555d8007f94d3c3539cddf3ee2e091dc2eea70",
        "donor_sha256": "4dc651327e80587a78dc5530cea9be81d61175ccdfb5856bf2b91124c3021fee",
        "patch_sha256": "e28dd66c51dde6800418ec7e79da06ed78e0b066d819c0e26538498fc8c5f72c",
    },
    "tests/unit/cstar-kernel-mcp/test_codex_session_append_retry.test.ts": {
        "base_blob_sha1": None,
        "donor_blob_sha1": "f25bf919b3a529a45df31a78f8234c01119a313b",
        "donor_sha256": "da0b4c45135024bec6d7478e44a921b6d63ed2b206c78e7240de10d3cfa27470",
        "patch_sha256": "b19ce5cd096bec9f0c59cbe5857c9af1cc0a0beaf81d9dd360f1861e74215cc8",
    },
    "tests/unit/cstar-kernel-mcp/test_codex_subagent_notification_identity.test.ts": {
        "base_blob_sha1": None,
        "donor_blob_sha1": "cb768b7eb35f3783b75f0154084b617acf3089ef",
        "donor_sha256": "eae6ccff813815fda1d1aa22eaead5d6c050c1ec0fcf9c76eaf8291a43ce2721",
        "patch_sha256": "44aa47c4705c37676f471f15df02d055d7b8b04c26cca6d007c0bf4b390c5c47",
    },
    "tests/unit/cstar-kernel-mcp/test_cos_delegation_policy.test.ts": {
        "base_blob_sha1": None,
        "donor_blob_sha1": "65e5b8fd3c94b21028be9ae20e9cd029e7dc45c2",
        "donor_sha256": "ed5ebbb9fa030e67b045521d2d598564c03ccd4878f589efbe6eb2ff123fcb73",
        "patch_sha256": "998edc28d1f1eabdce5c17774872b038e2f2abadc49cc2f90452e27936300b00",
    },
}
SHA1 = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def _ledger() -> dict[str, object]:
    text = REPORT.read_text(encoding="utf-8")
    start = "<!-- cstar-provenance-json:start -->"
    end = "<!-- cstar-provenance-json:end -->"
    assert start in text and end in text
    payload = text.split(start, 1)[1].split(end, 1)[0].strip()
    value = json.loads(payload)
    assert isinstance(value, dict)
    return value


def test_ledger_binds_the_exact_clean_base_and_batch_identity() -> None:
    ledger = _ledger()
    assert ledger["schema"] == "cstar.automatic_adoption_provenance.v1"
    assert ledger["batch"] == "A0"
    assert ledger["decision_id"] == "decision:cstar-auto-a0-provenance-20260802"
    assert ledger["bead_id"] == "bead:cstar:auto-a0-provenance-20260802"
    parent = ledger["parent"]
    assert parent == {
        "decision_id": "decision:cstar-automatic-internal-machinery-refactor-20260802",
        "bead_id": "bead:cstar:automatic-internal-machinery-refactor-20260802",
    }
    repository = ledger["repository"]
    assert repository["branch"] == "codex/cstar-auto-a0-provenance-20260802"
    assert repository["base_ref"] == "origin/master"
    assert repository["base_commit"] == BASE_COMMIT
    base = ledger["base_verification"]
    assert base["origin_master_resolves_to"] == BASE_COMMIT
    assert base["worktree_head"] == BASE_COMMIT
    assert base["exact_match"] is True
    targets = {entry["path"]: entry for entry in base["target_blobs"]}
    assert set(targets) == ALLOWLIST
    assert all(entry["base_blob_sha1"] is None for entry in targets.values())


def test_ledger_has_only_the_two_allowlisted_a0_hunks() -> None:
    ledger = _ledger()
    assert set(ledger["allowlist"]) == ALLOWLIST
    hunks = ledger["a0_authored_hunks"]
    assert {entry["path"] for entry in hunks} == ALLOWLIST
    assert all(entry["donor_bytes_adopted"] is False for entry in hunks)
    boundary = ledger["adoption_boundary"]
    assert boundary["implementation_bytes_copied"] is False
    assert boundary["donor_bytes_adopted"] is False
    assert boundary["unexplained_dirty_bytes_rejected"] is True
    assert boundary["adoption_mode"] == "metadata_only"
    assert "exact donor path" in boundary["selection_rule"]
    assert "unexplained" in boundary["rejection_rule"]


def test_donor_inventory_is_hash_bound_and_has_no_adopted_hunks() -> None:
    ledger = _ledger()
    inventory = {entry["path"]: entry for entry in ledger["donor_inventory"]}
    assert set(inventory) == set(DONOR_EVIDENCE)
    for path, expected in DONOR_EVIDENCE.items():
        entry = inventory[path]
        assert {key: entry[key] for key in expected} == expected
        assert entry["donor_lines"] <= 500
        assert entry["adoption_status"] == "metadata_only_rejected_for_byte_adoption"
        assert entry["adopted_hunks"] == []
        assert entry["allowed_hunk_description"].strip()
        assert entry["donor_blob_sha1"] and SHA1.fullmatch(entry["donor_blob_sha1"])
        assert SHA256.fullmatch(entry["donor_sha256"])
        assert SHA256.fullmatch(entry["patch_sha256"])
        if entry["base_blob_sha1"] is not None:
            assert SHA1.fullmatch(entry["base_blob_sha1"])


def test_future_attention_delivery_invariants_are_explicit() -> None:
    invariants = _ledger()["future_acceptance_invariants"]
    assert "CStar remains the state manager; the host transports messages." in invariants
    assert any("Please relay the error to CoS task …" in item for item in invariants)
    assert any("polling or a daemon" in item for item in invariants)
    assert any("secrets/configuration" in item for item in invariants)
    assert any("live provider calls" in item for item in invariants)


def test_current_worktree_changes_are_exactly_the_allowlist() -> None:
    diff = subprocess.run(
        ["git", "diff", "--name-only", "origin/master", "--"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    assert set(diff) | set(untracked) == ALLOWLIST


def test_focused_test_source_stays_within_the_file_size_gate() -> None:
    assert len(Path(__file__).read_text(encoding="utf-8").splitlines()) <= 500
