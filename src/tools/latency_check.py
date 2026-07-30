"""Fail-closed compatibility boundary for the retired engine profiler."""

RETIREMENT_ERROR = "legacy_sovereign_engine_retired_use_cstar_kernel"


def _retired(*_args: object, **_kwargs: object) -> None:
    raise RuntimeError(RETIREMENT_ERROR)


class LatencyProfiler:
    """Retired engine consumer retained only for an explicit migration error."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    measure_startup = _retired
    measure_search = _retired


def main() -> None:
    _retired()


if __name__ == "__main__":
    main()
