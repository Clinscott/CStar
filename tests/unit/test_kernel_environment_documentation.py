from pathlib import Path


ROOT = Path(__file__).parents[2]


def test_kernel_environment_contract_documents_allowlist_and_no_dotenv():
    text = (ROOT / "docs/operations/cstar-kernel-secret-environment-boundary.md").read_text(
        encoding="utf-8"
    )
    assert "explicit allowlist" in text
    assert "does not load a project `.env` file" in text
    assert "`NODE_OPTIONS`" in text
    assert "copy-then-scrub forwarding is not permitted" in text


def test_warden_and_mimir_retirement_contracts_are_current():
    text = (ROOT / "docs/operations/cstar-kernel-secret-environment-boundary.md").read_text(
        encoding="utf-8"
    )
    assert "`cstar_warden list` is a static read" in text
    assert "Huginn performs local regex checks only" in text
    assert "Shadow Forge is not a registered warden" in text
    assert "legacy_mimir_js_bridge_retired_use_host_native_researcher" in text


def test_mongo_mailbox_is_retired_instead_of_secret_env_disabled():
    text = (ROOT / "docs/operations/cstar-kernel-secret-environment-boundary.md").read_text(
        encoding="utf-8"
    )
    assert "`cstar_mongo_mailbox` surface is also retired in source" in text
    assert "legacy_mongo_mailbox_retired_use_cstar_kernel_hall_surfaces" in text
