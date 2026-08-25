"""Fail-closed compatibility boundary for the retired Sovereign Engine."""

RETIREMENT_ERROR = "legacy_sovereign_engine_retired_use_cstar_kernel"


def _retired(*_args: object, **_kwargs: object) -> None:
    raise RuntimeError(RETIREMENT_ERROR)


class SovereignEngine:
    """Retired entrypoint retained only to return the stable migration error."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    run = _retired
    teardown = _retired


def main() -> None:
    _retired()


if __name__ == "__main__":
    main()
