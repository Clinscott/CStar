"""Fail-closed compatibility boundary for the retired wrap-up workflow."""

RETIREMENT_ERROR = "legacy_wrap_it_up_retired_use_cstar_closeout"


def _retired(*_args: object, **_kwargs: object) -> None:
    raise RuntimeError(RETIREMENT_ERROR)


class SovereignWrapper:
    """Retired entrypoint retained only to return the stable migration error."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    initial_scan = _retired
    release_ravens = _retired
    wait_for_ravens = _retired
    run_gungnir_gate = _retired
    synchronize_state = _retired
    review_technical_debt = _retired
    sovereign_commit = _retired
    teardown = _retired


def main() -> None:
    _retired()


if __name__ == "__main__":
    main()
