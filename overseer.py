#!/usr/bin/env python3
"""WORK IN PROGRESS: compatibility wrapper for the AutoBot entrypoint migration."""

from src.core.engine.autobot_skill import main


if __name__ == "__main__":
    raise SystemExit(main())
