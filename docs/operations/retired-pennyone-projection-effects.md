# Retired PennyOne Projection Effects

Hall remains the canonical projection store. Pure functions may build an
in-memory matrix or estate view from caller-supplied or Hall-backed records, but
legacy PennyOne helpers cannot materialize a second authority or perform an
unrepresented action.

The following compatibility surfaces fail before effects:

- matrix artifact writes: `legacy_matrix_artifact_write_retired_use_cstar_kernel`
- detached gravity database access or mutation:
  `legacy_gravity_store_retired_use_cstar_kernel`
- direct search output: `legacy_pennyone_direct_search_retired_use_cstar_hall_search`
- generated QMD report writes:
  `legacy_pennyone_report_writer_retired_use_cstar_kernel`
- the Node PennyOne Warden and its `.agents` ledger:
  `legacy_node_pennyone_warden_retired_use_cstar_warden`
- direct document-version restoration:
  `legacy_hall_document_restore_retired_requires_operator_gate`
- direct chronicle ingestion:
  `legacy_chronicle_indexer_retired_use_cstar_hall_surfaces`
- repository-wide semantic crawling:
  `legacy_semantic_indexer_retired_use_cstar_hall_surfaces`
- legacy Hall migration and sovereign-state reads:
  `legacy_hall_migration_retired_requires_cstar_lifecycle` and
  `legacy_sovereign_state_reader_retired_use_cstar_hall_surfaces`

Source analysis now assigns zero runtime gravity. It does not create
`gravity.db`, collect Git churn, query agent pings, refresh a cache, or consult
stale sovereign metadata. Request-bound evidence can be joined later through a
typed, validated CStar surface; it is not silently collected during parsing.

`readProjectedMatrixGraph` and `compileMatrixPayload` remain read-only in-memory
views. Search belongs to `cstar_hall_search`, Warden execution belongs to
`cstar_warden`, and any future artifact or restore operation needs an explicit
kernel capability, operator gate, containment manifest, and durable receipt.
Historical imports likewise require a typed CStar lifecycle surface; a library
function may not crawl source or migrate live Hall state directly.
