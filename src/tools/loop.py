"""Fail-closed compatibility boundary for the retired sovereign loop."""

RETIREMENT_ERROR = "legacy_wrap_it_up_retired_use_cstar_closeout"


def _retired(*_args: object, **_kwargs: object) -> None:
    raise RuntimeError(RETIREMENT_ERROR)


class SovereignForge:
    """Retired autonomous Forge entrypoint."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    forge_task = _retired


class SovereignLifecycle:
    """Retired autonomous lifecycle entrypoint."""

    execute = staticmethod(_retired)


def main() -> None:
    _retired()


if __name__ == "__main__":
    main()
