from __future__ import annotations

import difflib
import hashlib
import json
import os
import re
import stat
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "docs" / "reports" / "cstar-automatic-machinery-provenance-20260802.md"
DONOR_ROOT = Path("/home/morderith/Corvus/CStar/work/truth/cstar-master-20260730").resolve()
BASE_COMMIT = "5887042deefaae240db2a546f3cc9640f601e9e2"
PATCH_SCHEMA = "cstar.automatic_adoption_patch.v1"
ALLOWLIST = {
    "docs/reports/cstar-automatic-machinery-provenance-20260802.md",
    "tests/contracts/test_cstar_automatic_adoption_provenance.py",
}
DONOR_EVIDENCE = {
    "src/tools/cstar-kernel-mcp/tools/codex_request_identity.ts": {
        "base_blob_sha1": "ea7338727cecfa4ed32388635da5c7bbb8c73f99",
        "donor_blob_sha1": "3f07b3523abe9c8af7148302c42cb3fda2c9ce58",
        "donor_sha256": "31612c20fc80c9ed954eca4153d4095a45fe87dd4d21e55eef6829bc1357d34d",
        "patch_sha256": "210552d2b881154ee567d06335edd2c5972b65b5c5029cbfc08469d8c8eaa7db",
        "patch_material_bytes": 8795,
        "patch_hunk_count": 6,
    },
    "src/tools/cstar-kernel-mcp/tools/codex_session_append_retry.ts": {
        "base_blob_sha1": None,
        "donor_blob_sha1": "da9d51f412cebae0bae376f10b6547c2f478c278",
        "donor_sha256": "e99b97549569c48b9fc93d47a7a8883efb60284924baf5fb0caa0cd3326e7e54",
        "patch_sha256": "de139ba1c8ea65b397bf0966e255b08e29a8ecd4cda26755fe9d0ec6ddfb9e75",
        "patch_material_bytes": 5406,
        "patch_hunk_count": 1,
    },
    "src/tools/cstar-kernel-mcp/tools/codex_session_authority_projection.ts": {
        "base_blob_sha1": "f863a28f8e0813929fd6703e1fcae8f581616d46",
        "donor_blob_sha1": "3f555d8007f94d3c3539cddf3ee2e091dc2eea70",
        "donor_sha256": "4dc651327e80587a78dc5530cea9be81d61175ccdfb5856bf2b91124c3021fee",
        "patch_sha256": "29576d9cdbf7190492b2a14d76c033ab6470ea237799ac563360d37243d65d59",
        "patch_material_bytes": 1667,
        "patch_hunk_count": 1,
    },
    "tests/unit/cstar-kernel-mcp/test_codex_session_append_retry.test.ts": {
        "base_blob_sha1": None,
        "donor_blob_sha1": "f25bf919b3a529a45df31a78f8234c01119a313b",
        "donor_sha256": "da0b4c45135024bec6d7478e44a921b6d63ed2b206c78e7240de10d3cfa27470",
        "patch_sha256": "84ff98240978c639fc418abe7089fc944694d3d0ccbb93fa9f6c6ac3d3c54c94",
        "patch_material_bytes": 4915,
        "patch_hunk_count": 1,
    },
    "tests/unit/cstar-kernel-mcp/test_codex_subagent_notification_identity.test.ts": {
        "base_blob_sha1": None,
        "donor_blob_sha1": "cb768b7eb35f3783b75f0154084b617acf3089ef",
        "donor_sha256": "eae6ccff813815fda1d1aa22eaead5d6c050c1ec0fcf9c76eaf8291a43ce2721",
        "patch_sha256": "cb0489c74755af82fdea2b219ff3edb0957107b80b32e675c8431294fe55b627",
        "patch_material_bytes": 3216,
        "patch_hunk_count": 1,
    },
    "tests/unit/cstar-kernel-mcp/test_cos_delegation_policy.test.ts": {
        "base_blob_sha1": None,
        "donor_blob_sha1": "65e5b8fd3c94b21028be9ae20e9cd029e7dc45c2",
        "donor_sha256": "ed5ebbb9fa030e67b045521d2d598564c03ccd4878f589efbe6eb2ff123fcb73",
        "patch_sha256": "22709ebc3185d9f377bd087f2cc4167c9b743fa05eb0f3a60ce628cbf5146ddf",
        "patch_material_bytes": 5240,
        "patch_hunk_count": 1,
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


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _git_blob_sha1(value: bytes) -> str:
    header = f"blob {len(value)}\0".encode("ascii")
    return hashlib.sha1(header + value).hexdigest()


def _bounded_donor_bytes(relative_path: str) -> bytes:
    relative = Path(relative_path)
    assert relative.as_posix() == relative_path
    assert not relative.is_absolute() and ".." not in relative.parts
    candidate = DONOR_ROOT / relative
    assert not candidate.is_symlink()
    resolved = candidate.resolve(strict=True)
    assert resolved.is_relative_to(DONOR_ROOT)

    descriptor = os.open(candidate, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(descriptor)
        assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            value = stream.read()
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    before_identity = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
    after_identity = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
    assert before_identity == after_identity
    assert len(value) == before.st_size
    return value


def _base_blob_bytes(relative_path: str, expected_present: bool) -> bytes | None:
    object_name = f"{BASE_COMMIT}:{relative_path}"
    probe = subprocess.run(
        ["git", "cat-file", "-e", object_name],
        cwd=ROOT,
        capture_output=True,
    )
    if not expected_present:
        assert probe.returncode != 0
        return None
    assert probe.returncode == 0, probe.stderr.decode("utf-8", errors="replace")
    result = subprocess.run(
        ["git", "show", object_name],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return result.stdout


def _canonical_patch_material(
    relative_path: str,
    change_kind: str,
    base: bytes | None,
    donor: bytes,
) -> tuple[bytes, int]:
    header = json.dumps(
        {
            "base_present": base is not None,
            "change_kind": change_kind,
            "path": relative_path,
            "schema": PATCH_SCHEMA,
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8") + b"\n"
    patch = b"".join(
        difflib.diff_bytes(
            difflib.unified_diff,
            (base or b"").splitlines(keepends=True),
            donor.splitlines(keepends=True),
            fromfile=(f"a/{relative_path}".encode() if base is not None else b"/dev/null"),
            tofile=f"b/{relative_path}".encode(),
            n=3,
            lineterm=b"\n",
        )
    )
    hunk_count = sum(line.startswith(b"@@ ") for line in patch.splitlines())
    return header + patch, hunk_count


def _adoption_rejection(
    adopted: dict[str, list[bytes]],
    donors: dict[str, bytes],
    allowed_hunk_sha256: set[str],
) -> str | None:
    for target_path, chunks in adopted.items():
        if target_path not in donors:
            return f"unexplained_donor_path:{target_path}"
        for content in chunks:
            for donor_path, donor in donors.items():
                if donor and donor in content:
                    return f"wholesale_donor_file_adoption:{donor_path}"
            if _sha256(content) not in allowed_hunk_sha256:
                return f"unexplained_adopted_content:{target_path}"
    return None


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
    integration = ledger["integration_gate"]
    assert integration["branch"] == "codex/cstar-automatic-internal-machinery-refactor-20260802"
    assert integration["worktree"] is None
    assert integration["observed_before_acceptance"] == "absent"
    assert integration["independent_acceptance_required"] is True
    assert "absence before acceptance is intentional" in integration["creation_rule"]
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
    assert boundary["wholesale_donor_file_adoption_rejected"] is True
    assert boundary["adoption_mode"] == "metadata_only"
    assert "exact donor path" in boundary["selection_rule"]
    assert "Entire donor-file byte sequences" in boundary["rejection_rule"]
    contract = ledger["hash_contract"]
    assert contract["schema"] == PATCH_SCHEMA
    assert contract["patch_header_keys"] == [
        "base_present", "change_kind", "path", "schema",
    ]
    assert "difflib.diff_bytes(unified_diff)" in contract["patch_sha256_input"]


def test_donor_inventory_recomputes_exact_bytes_blobs_and_patch_material() -> None:
    ledger = _ledger()
    inventory = {entry["path"]: entry for entry in ledger["donor_inventory"]}
    assert set(inventory) == set(DONOR_EVIDENCE)
    for path, expected in DONOR_EVIDENCE.items():
        entry = inventory[path]
        assert {key: entry[key] for key in expected} == expected
        donor = _bounded_donor_bytes(path)
        assert _sha256(donor) == entry["donor_sha256"]
        assert _git_blob_sha1(donor) == entry["donor_blob_sha1"]
        base = _base_blob_bytes(path, entry["base_blob_sha1"] is not None)
        if base is not None:
            assert _git_blob_sha1(base) == entry["base_blob_sha1"]
        material, hunk_count = _canonical_patch_material(
            path, entry["change_kind"], base, donor,
        )
        assert _sha256(material) == entry["patch_sha256"]
        assert len(material) == entry["patch_material_bytes"]
        assert hunk_count == entry["patch_hunk_count"]
        assert len(donor.splitlines()) == entry["donor_lines"] <= 500
        assert entry["adoption_status"] == "metadata_only_rejected_for_byte_adoption"
        assert entry["adopted_hunks"] == []
        assert entry["allowed_hunk_description"].strip()
        assert entry["donor_blob_sha1"] and SHA1.fullmatch(entry["donor_blob_sha1"])
        assert SHA256.fullmatch(entry["donor_sha256"])
        assert SHA256.fullmatch(entry["patch_sha256"])
        if entry["base_blob_sha1"] is not None:
            assert SHA1.fullmatch(entry["base_blob_sha1"])


def test_wholesale_or_unexplained_adoption_is_rejected_adversarially() -> None:
    ledger = _ledger()
    inventory = {entry["path"]: entry for entry in ledger["donor_inventory"]}
    donors = {path: _bounded_donor_bytes(path) for path in inventory}
    allowed_hunks = {
        hunk["sha256"]
        for entry in inventory.values()
        for hunk in entry["adopted_hunks"]
    }
    assert allowed_hunks == set()
    assert _adoption_rejection({}, donors, allowed_hunks) is None

    first_path = next(iter(donors))
    wholesale = _adoption_rejection(
        {first_path: [b"metadata-prefix\n" + donors[first_path]]}, donors, allowed_hunks,
    )
    assert wholesale == f"wholesale_donor_file_adoption:{first_path}"
    assert _adoption_rejection(
        {first_path: [b"unexplained partial content"]}, donors, allowed_hunks,
    ) == f"unexplained_adopted_content:{first_path}"
    assert _adoption_rejection(
        {"src/unlisted-donor.ts": [b"content"]}, donors, allowed_hunks,
    ) == "unexplained_donor_path:src/unlisted-donor.ts"

    a0_artifacts = {(ROOT / path).read_bytes() for path in ALLOWLIST}
    assert all(donor not in artifact for donor in donors.values() for artifact in a0_artifacts)


def test_future_attention_delivery_invariants_are_explicit() -> None:
    invariants = _ledger()["future_acceptance_invariants"]
    assert "CStar remains the state manager; the host transports messages." in invariants
    assert any("Please relay the error to CoS task …" in item for item in invariants)
    assert any("polling or a daemon" in item for item in invariants)
    assert any("secrets/configuration" in item for item in invariants)
    assert any("live provider calls" in item for item in invariants)


def test_current_worktree_changes_are_exactly_the_allowlist() -> None:
    ledger = _ledger()
    repository = ledger["repository"]
    assert repository["worktree"] == "/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-auto-a0-20260802"
    assert repository["branch"] == "codex/cstar-auto-a0-provenance-20260802"
    assert repository["base_ref"] == "origin/master"
    assert repository["base_commit"] == BASE_COMMIT
    assert ledger["base_verification"]["worktree_head"] == BASE_COMMIT
    assert set(ledger["allowlist"]) == ALLOWLIST
    hunks = ledger["a0_authored_hunks"]
    assert {entry["path"] for entry in hunks} == ALLOWLIST
    assert all(entry["donor_bytes_adopted"] is False for entry in hunks)
    assert ledger["mandated_checks"] == [
        "node scripts/run-python.mjs -m pytest -q tests/contracts/test_cstar_automatic_adoption_provenance.py",
        "npm run typecheck",
        "git diff --check",
        "git diff --name-only origin/master -- '*.ts' '*.py' | xargs -r wc -l",
    ]


def test_focused_test_source_stays_within_the_file_size_gate() -> None:
    assert len(Path(__file__).read_text(encoding="utf-8").splitlines()) <= 500
