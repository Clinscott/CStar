import sys


def main() -> None:
    print(
        "chant is a host-native CStar skill. Activate it through the active host session; "
        "this legacy script adapter no longer dispatches planning work.",
        file=sys.stderr,
    )
    raise SystemExit(2)


if __name__ == "__main__":
    main()
