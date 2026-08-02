<!-- cstar-provenance-json:start -->
{
  "schema": "cstar.automatic_adoption_provenance.v1",
  "batch": "A0",
  "mission": "CStar automatic internal machinery refactor",
  "parent": {
    "decision_id": "decision:cstar-automatic-internal-machinery-refactor-20260802",
    "bead_id": "bead:cstar:automatic-internal-machinery-refactor-20260802"
  },
  "decision_id": "decision:cstar-auto-a0-provenance-20260802",
  "bead_id": "bead:cstar:auto-a0-provenance-20260802",
  "bead_claim": {
    "status": "IN_PROGRESS",
    "assigned_agent": "019fc2a9-2c20-7422-a265-8dfe7777c2db",
    "claim_surface": "root-cos-orchestrator",
    "claim_verified_via": "cstar_bead:get",
    "child_identity_defect": "codex_request_identity_thread_mismatch"
  },
  "model_identity": {
    "requested_model": "Luna Max",
    "actual_model": "unreported",
    "model_source": "host did not expose an enforceable actual-model selector"
  },
  "repository": {
    "canonical_repo": "/home/morderith/Corvus/CStar",
    "truth_checkout": "/home/morderith/Corvus/CStar/work/truth/cstar-master-20260730",
    "worktree": "/home/morderith/Corvus/CStar/work/pr-worktrees/cstar-auto-a0-20260802",
    "branch": "codex/cstar-auto-a0-provenance-20260802",
    "base_ref": "origin/master",
    "base_commit": "5887042deefaae240db2a546f3cc9640f601e9e2"
  },
  "base_verification": {
    "origin_master_resolves_to": "5887042deefaae240db2a546f3cc9640f601e9e2",
    "worktree_head": "5887042deefaae240db2a546f3cc9640f601e9e2",
    "exact_match": true,
    "blob_hash_algorithm": "git object id SHA-1",
    "target_blobs": [
      {
        "path": "docs/reports/cstar-automatic-machinery-provenance-20260802.md",
        "base_blob_sha1": null,
        "base_blob_status": "absent_on_origin_master"
      },
      {
        "path": "tests/contracts/test_cstar_automatic_adoption_provenance.py",
        "base_blob_sha1": null,
        "base_blob_status": "absent_on_origin_master"
      }
    ]
  },
  "actions": {
    "repository": "Clinscott/CStar",
    "enabled": false,
    "proof_surface": "read-only GitHub Actions permissions API",
    "command": "gh api repos/Clinscott/CStar/actions/permissions --jq '{enabled: .enabled, allowed_actions: .allowed_actions, sha_pinning_required: .sha_pinning_required}'"
  },
  "freshness": {
    "codex_version": "codex-cli 0.146.0",
    "hermes_version": "Hermes Agent v0.19.1",
    "hermes_update_check": "already_up_to_date",
    "hermes_checkout": "/home/morderith/Corvus/AutoBot/hermes-agent",
    "hermes_checkout_clean": true,
    "live_provider_attempt": false
  },
  "python_runtime": {
    "project_venv_present": false,
    "explicit_executable": "/usr/bin/python3",
    "pytest_version": "pytest 9.0.2",
    "launcher_override": "CSTAR_PYTHON_EXECUTABLE=/usr/bin/python3"
  },
  "allowlist": [
    "docs/reports/cstar-automatic-machinery-provenance-20260802.md",
    "tests/contracts/test_cstar_automatic_adoption_provenance.py"
  ],
  "a0_authored_hunks": [
    {
      "path": "docs/reports/cstar-automatic-machinery-provenance-20260802.md",
      "description": "Machine-readable provenance ledger and human-readable adoption boundary; no donor source text or implementation bytes copied.",
      "donor_bytes_adopted": false
    },
    {
      "path": "tests/contracts/test_cstar_automatic_adoption_provenance.py",
      "description": "Focused contract assertions for identity, base, allowlist, donor hashes, rejection policy, future attention-delivery invariants, and exact changed-path scope.",
      "donor_bytes_adopted": false
    }
  ],
  "adoption_boundary": {
    "implementation_bytes_copied": false,
    "donor_bytes_adopted": false,
    "unexplained_dirty_bytes_rejected": true,
    "adoption_mode": "metadata_only",
    "selection_rule": "A later adoption must name an exact donor path, base blob, donor hash, patch hash, and reviewed hunk description before any byte is copied.",
    "rejection_rule": "Every dirty-truth byte not represented by the bounded donor inventory or the two-file allowlist is unexplained for A0 and rejected."
  },
  "donor_inventory": [
    {
      "path": "src/tools/cstar-kernel-mcp/tools/codex_request_identity.ts",
      "change_kind": "modified",
      "base_blob_sha1": "ea7338727cecfa4ed32388635da5c7bbb8c73f99",
      "donor_blob_sha1": "3f07b3523abe9c8af7148302c42cb3fda2c9ce58",
      "donor_sha256": "31612c20fc80c9ed954eca4153d4095a45fe87dd4d21e55eef6829bc1357d34d",
      "patch_sha256": "16b4f58f1f0662769345a512c4635dbe0629620121350ddf4d16d0c83d2ca0cd",
      "donor_lines": 313,
      "allowed_hunk_description": "Excludes complete host-carried subagent notifications from root-user classification and adds ordered turn-set/sealed-prefix provenance helpers.",
      "adoption_status": "metadata_only_rejected_for_byte_adoption",
      "adopted_hunks": []
    },
    {
      "path": "src/tools/cstar-kernel-mcp/tools/codex_session_append_retry.ts",
      "change_kind": "untracked",
      "base_blob_sha1": null,
      "donor_blob_sha1": "da9d51f412cebae0bae376f10b6547c2f478c278",
      "donor_sha256": "e99b97549569c48b9fc93d47a7a8883efb60284924baf5fb0caa0cd3326e7e54",
      "patch_sha256": "23e4d18a7be16b7dad255ec2919bee38e8fce3a6d5a3fe434c7ae5d4cfcf4584",
      "donor_lines": 136,
      "allowed_hunk_description": "Proposes bounded append-only session snapshots and retries with ownership, link-count, size, identity, and hash checks.",
      "adoption_status": "metadata_only_rejected_for_byte_adoption",
      "adopted_hunks": []
    },
    {
      "path": "src/tools/cstar-kernel-mcp/tools/codex_session_authority_projection.ts",
      "change_kind": "modified",
      "base_blob_sha1": "f863a28f8e0813929fd6703e1fcae8f581616d46",
      "donor_blob_sha1": "3f555d8007f94d3c3539cddf3ee2e091dc2eea70",
      "donor_sha256": "4dc651327e80587a78dc5530cea9be81d61175ccdfb5856bf2b91124c3021fee",
      "patch_sha256": "e28dd66c51dde6800418ec7e79da06ed78e0b066d819c0e26538498fc8c5f72c",
      "donor_lines": 499,
      "allowed_hunk_description": "Broadens exact user-event mirror validation to optional empty audio fields while retaining a closed payload-key allowlist.",
      "adoption_status": "metadata_only_rejected_for_byte_adoption",
      "adopted_hunks": []
    },
    {
      "path": "tests/unit/cstar-kernel-mcp/test_codex_session_append_retry.test.ts",
      "change_kind": "untracked",
      "base_blob_sha1": null,
      "donor_blob_sha1": "f25bf919b3a529a45df31a78f8234c01119a313b",
      "donor_sha256": "da0b4c45135024bec6d7478e44a921b6d63ed2b206c78e7240de10d3cfa27470",
      "patch_sha256": "b19ce5cd096bec9f0c59cbe5857c9af1cc0a0beaf81d9dd360f1861e74215cc8",
      "donor_lines": 126,
      "allowed_hunk_description": "Exercises append growth retry, retry caps, truncation/replacement/symlink/prefix drift, unsafe files, and non-retryable authority errors.",
      "adoption_status": "metadata_only_rejected_for_byte_adoption",
      "adopted_hunks": []
    },
    {
      "path": "tests/unit/cstar-kernel-mcp/test_codex_subagent_notification_identity.test.ts",
      "change_kind": "untracked",
      "base_blob_sha1": null,
      "donor_blob_sha1": "cb768b7eb35f3783b75f0154084b617acf3089ef",
      "donor_sha256": "eae6ccff813815fda1d1aa22eaead5d6c050c1ec0fcf9c76eaf8291a43ce2721",
      "patch_sha256": "44aa47c4705c37676f471f15df02d055d7b8b04c26cca6d007c0bf4b390c5c47",
      "donor_lines": 69,
      "allowed_hunk_description": "Checks that host-carried subagent notifications are non-user authority records and that only complete notification envelopes are isolated.",
      "adoption_status": "metadata_only_rejected_for_byte_adoption",
      "adopted_hunks": []
    },
    {
      "path": "tests/unit/cstar-kernel-mcp/test_cos_delegation_policy.test.ts",
      "change_kind": "untracked",
      "base_blob_sha1": null,
      "donor_blob_sha1": "65e5b8fd3c94b21028be9ae20e9cd029e7dc45c2",
      "donor_sha256": "ed5ebbb9fa030e67b045521d2d598564c03ccd4878f589efbe6eb2ff123fcb73",
      "patch_sha256": "998edc28d1f1eabdce5c17774872b038e2f2abadc49cc2f90452e27936300b00",
      "donor_lines": 95,
      "allowed_hunk_description": "Checks that CoS does not implement, self-validate, launch workers, own host goals, or silently substitute models.",
      "adoption_status": "metadata_only_rejected_for_byte_adoption",
      "adopted_hunks": []
    }
  ],
  "future_acceptance_invariants": [
    "CStar remains the state manager; the host transports messages.",
    "The failure mode 'Please relay the error to CoS task …' is forbidden; automatic attention delivery must deliver structured host transport outcomes directly without worker relay instructions.",
    "Automatic attention delivery must not use polling or a daemon.",
    "A0 introduces no secrets/configuration, paid services, or live provider calls.",
    "A0 does not adopt implementation bytes; later selective adoption requires the recorded provenance boundary."
  ],
  "mandated_checks": [
    "node scripts/run-python.mjs -m pytest -q tests/contracts/test_cstar_automatic_adoption_provenance.py",
    "npm run typecheck",
    "git diff --check",
    "git diff --name-only origin/master -- '*.ts' '*.py' | xargs -r wc -l"
  ],
  "source_size_rule": "Every touched production/test source must be at most 500 lines."
}
<!-- cstar-provenance-json:end -->

# CStar automatic machinery A0 provenance gate

This is a metadata-only adoption gate. It records the exact clean base, the
bounded dirty-truth donor inventory, and the reviewed descriptions of candidate
hunks without importing donor implementation or donor test bytes. The two
allowlisted files are the only A0 artifacts.

## Adoption decision

No implementation bytes are adopted in A0. The donor inventory is evidence for
later selective adoption, not an authorization to copy a dirty checkout. Any
unexplained dirty byte is rejected until it receives its own exact path, base
blob, donor hash, patch hash, and hunk-level review.

The future automatic attention path must preserve the state-manager/host-
transport boundary. In particular, a worker must never be instructed to relay
an error to a CoS task; the host transport must carry a structured attention
outcome directly.

## Verification contract

The focused test parses the JSON ledger above, checks the exact allowlist and
hash shapes, binds every donor record to its recorded evidence, asserts the
future acceptance invariants, and rejects any changed path outside A0. The
remaining mandated checks are listed in the ledger and are run from this
worktree before commit.
