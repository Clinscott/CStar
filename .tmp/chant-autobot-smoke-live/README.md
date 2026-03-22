# Chant AutoBot Probe

This is a disposable workspace for a live Corvus Star chant/autobot test.

Goal:
- Build a small and useful Python utility named `title_slug.py`.
- The script should expose a `slugify(text: str) -> str` function.
- The script should also work as a CLI:
  - `python3 title_slug.py "Quarterly Review: Alpha/Beta"` prints `quarterly-review-alpha-beta`

Rules:
- Keep the implementation in a single file: `title_slug.py`.
- Use only the Python standard library.
- Make the tests under `tests/` pass.

Validation command:
- `python3 -m unittest discover -s tests -p 'test_*.py' -q`
