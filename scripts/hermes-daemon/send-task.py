#!/usr/bin/env python3
"""Fail-closed compatibility entrypoint for retired public Hermes tasks."""

from retired import main


if __name__ == "__main__":
    raise SystemExit(main())
