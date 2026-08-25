# Quarantine governance

Quarantine is excluded evidence, not a green test result. The normal suite may
pass while these files remain unexecuted. No production, holdout, or
"all-tests" claim may count quarantined files as passing.

The current inventory is frozen at 121 executable test/support files with
sorted-path SHA-256
`038d1d16924105b3eaa4218ae0593724b22839958326b981f27f6097813492f1`.
`tests/unit/test_quarantine_governance.py` fails when a file is added, removed,
or moved without an explicit inventory review.

Current reason classes:

- `mind_archive_predecessors/`: historical predecessor/AutoBot surfaces that
  must never re-enter maintained discovery.
- `empire_tests_stale/`: stale legacy contracts that disagree with current
  architecture.
- `dispatcher_kernel_fallback/`: retired fallback behavior.
- `pennyone_vis_server_retired/`: tests for the removed visualization server.
- `database_mock_property/`, `host_governor_require_fix/`,
  `sync_slice_and_host_worker/`: isolated suites with known harness or contract
  repair requirements.
- `state_dependent/`: tests that require non-hermetic mutable host state.
- `retired_direct_research/`: stale tests that require direct Brave/Gemini
  search, automatic lexicon mutation, or live documentation injection. Those
  bypasses were retired in favor of CStar Researcher receipts.
- `generated_gauntlet_artifacts/`: malformed or machine-emitted historical
  snippets that are artifacts, not executable maintained tests.
- root-level files: frozen legacy/unmaintained snapshot pending individual
  promotion, retirement, or reasoned relocation.

Owner: CStar maintainers under CoS audit. Review trigger: every major-model
estate audit and any change to test discovery. Updating the count/hash requires
a same-change note explaining which files were promoted, retired, or newly
quarantined and why. A newly quarantined regression test must receive a narrow
reason class; adding it silently to the root snapshot is forbidden.
