"""Fail-closed compatibility boundary for the retired dialogue engine audit."""

RETIREMENT_ERROR = "legacy_sovereign_engine_retired_use_cstar_kernel"


def _retired(*_args: object, **_kwargs: object) -> None:
    raise RuntimeError(RETIREMENT_ERROR)


class DialogueAuditor:
    """Retired engine consumer retained only for an explicit migration error."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    audit = _retired


def main() -> None:
    _retired()


if __name__ == "__main__":
    main()
