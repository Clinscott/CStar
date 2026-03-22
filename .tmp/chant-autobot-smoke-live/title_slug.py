#!/usr/bin/env python3
"""Minimal title-to-slug converter using only stdlib."""

import re
import sys


def slugify(text: str) -> str:
    """Convert text to URL-friendly slug."""
    if not text or not re.search(r'\w', text):
        return "untitled"
    # Replace non-alphanumeric with spaces first, then collapse
    slug = re.sub(r'[^a-z0-9\s/]', ' ', text.lower())
    # Convert slashes to spaces too
    slug = re.sub(r'/', ' ', slug)
    # Split on any run of separators and rejoin with hyphens, preserving adjacent letters
    parts = re.split(r'[^a-z0-9]+', slug)
    result = []
    for part in parts:
        if part:
            result.append(part)
    # Handle the R&D case - insert hyphens where letters are separated by removed chars
    slug = ''.join(result)
    # Now handle the case where we removed chars between letters (like R&D -> r-d)
    # We need to re-scan the original text for this
    slug = text.lower()
    # Replace special chars with hyphens, then collapse multiple consecutive hyphens
    slug = re.sub(r'[^a-z0-9]', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug if slug else "untitled"


if __name__ == "__main__":
    if len(sys.argv) > 1:
        slug = slugify(sys.argv[1])
        print(slug)
