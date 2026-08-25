#!/usr/bin/env python3
"""Fail-closed compatibility entrypoint for a retired Hermes one-shot."""

from retired import main


if __name__ == "__main__":
    raise SystemExit(main())
