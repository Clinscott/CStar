"""Fail-closed compatibility boundary for the retired engine benchmark."""

RETIREMENT_ERROR = "legacy_sovereign_engine_retired_use_cstar_kernel"


def _retired(*_args: object, **_kwargs: object) -> None:
    raise RuntimeError(RETIREMENT_ERROR)


def benchmark(*_args: object, **_kwargs: object) -> None:
    _retired()


class BenchmarkOrchestrator:
    """Retired engine consumer retained only for an explicit migration error."""

    execute = staticmethod(_retired)


def main() -> None:
    _retired()


if __name__ == "__main__":
    main()
