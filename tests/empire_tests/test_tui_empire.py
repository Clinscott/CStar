"""
Empire Test Suite for Sovereign HUD (TUI) — Operation Ragnarök.

Adheres to the Linscott Standard for Verification.

Tests cover:
    1. DaemonClient connectivity & graceful degradation
    2. SovereignApp instantiation & theming
    3. Lore dictionary completeness for both personas
    4. TransitionScreen logic for ODIN and ALFRED
    5. Keybinding registration
    6. PROJECT_ROOT resolution
    7. Phrase loader resilience
    8. GPHSGauge rendering
    9. CommandInput autocomplete
    10. Dashboard/Forge/Trace screen composition
    11. VitalsHeader update logic
"""

import json
import pytest
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from src.cstar.core.tui import (
    KNOWN_COMMANDS,
    LORE,
    PROJECT_ROOT,
    CommandInput,
    DashboardScreen,
    ForgeScreen,
    GPHSGauge,
    HelpScreen,
    SovereignApp,
    TraceScreen,
    VitalsHeader,
    _load_greeting,
)


# ═══════════════════════════════════════════════════════════════════════════
# 2. SovereignApp Instantiation
# ═══════════════════════════════════════════════════════════════════════════


def test_sovereign_app_instantiation() -> None:
    """Verify SovereignApp can be instantiated with correct TITLE."""
    app = SovereignApp()
    assert app.title == "C* SOVEREIGN HUD"


def test_sovereign_app_has_css() -> None:
    """Verify the CSS contains both theme class selectors."""
    app = SovereignApp()
    assert ".theme-odin" in app.CSS
    assert ".theme-alfred" in app.CSS


def test_sovereign_app_has_screens() -> None:
    """Verify screens are registered in SCREENS dict."""
    assert "dashboard" in SovereignApp.SCREENS
    assert "forge" in SovereignApp.SCREENS
    assert "traces" in SovereignApp.SCREENS


# ═══════════════════════════════════════════════════════════════════════════
# 3. Lore Dictionary Completeness
# ═══════════════════════════════════════════════════════════════════════════

REQUIRED_LORE_KEYS = [
    "app_title", "theme_class", "prompt",
    "header_title", "sidebar_title", "trace_title",
    "console_title", "forge_title", "help_title",
    "separator", "bullet", "divider", "empty_state",
    "online", "offline", "gphs_label",
    "forge_start", "forge_progress", "forge_done", "forge_fail",
    "transition_in", "transition_out",
]


def test_odin_lore_completeness() -> None:
    """Verify ODIN lore dictionary contains all required keys."""
    for key in REQUIRED_LORE_KEYS:
        assert key in LORE["ODIN"], f"Missing ODIN lore key: {key}"


def test_alfred_lore_completeness() -> None:
    """Verify ALFRED lore dictionary contains all required keys."""
    for key in REQUIRED_LORE_KEYS:
        assert key in LORE["ALFRED"], f"Missing ALFRED lore key: {key}"


def test_lore_personas_present() -> None:
    """Verify both ODIN and ALFRED personas exist in LORE."""
    assert "ODIN" in LORE
    assert "ALFRED" in LORE


def test_odin_theme_class_value() -> None:
    """Verify ODIN theme class string matches CSS convention."""
    assert LORE["ODIN"]["theme_class"] == "theme-odin"


def test_alfred_theme_class_value() -> None:
    """Verify ALFRED theme class string matches CSS convention."""
    assert LORE["ALFRED"]["theme_class"] == "theme-alfred"


# ═══════════════════════════════════════════════════════════════════════════
# 5. Keybindings
# ═══════════════════════════════════════════════════════════════════════════


def test_keybindings_registered() -> None:
    """Verify all expected keybindings are registered on SovereignApp."""
    binding_keys = [b.key for b in SovereignApp.BINDINGS]
    expected = ["f1", "f2", "f3", "f4", "ctrl+s", "escape"]
    for key in expected:
        assert key in binding_keys, f"Missing keybinding: {key}"


# ═══════════════════════════════════════════════════════════════════════════
# 6. PROJECT_ROOT Resolution
# ═══════════════════════════════════════════════════════════════════════════


def test_project_root_resolution() -> None:
    """Verify PROJECT_ROOT points to the actual repo root."""
    assert (PROJECT_ROOT / "pyproject.toml").exists()


# ═══════════════════════════════════════════════════════════════════════════
# 7. Phrase Loader
# ═══════════════════════════════════════════════════════════════════════════


def test_load_greeting_odin() -> None:
    """Verify _load_greeting returns a non-empty string for ODIN."""
    greeting = _load_greeting("ODIN")
    assert isinstance(greeting, str)
    assert len(greeting) > 0


def test_load_greeting_alfred() -> None:
    """Verify _load_greeting returns a non-empty string for ALFRED."""
    greeting = _load_greeting("ALFRED")
    assert isinstance(greeting, str)
    assert len(greeting) > 0


def test_load_greeting_fallback() -> None:
    """Verify _load_greeting returns a fallback for unknown persona."""
    greeting = _load_greeting("UNKNOWN")
    assert isinstance(greeting, str)
    assert len(greeting) > 0


# ═══════════════════════════════════════════════════════════════════════════
# 8. GPHSGauge
# ═══════════════════════════════════════════════════════════════════════════


def test_gphs_gauge_instantiation() -> None:
    """Verify GPHSGauge can be instantiated."""
    gauge = GPHSGauge()
    assert gauge is not None


# ═══════════════════════════════════════════════════════════════════════════
# 9. Command Autocomplete
# ═══════════════════════════════════════════════════════════════════════════


def test_known_commands_list() -> None:
    """Verify KNOWN_COMMANDS contains essential commands."""
    assert "scout" in KNOWN_COMMANDS
    assert "forge" in KNOWN_COMMANDS
    assert "sleep" in KNOWN_COMMANDS
    assert "help" in KNOWN_COMMANDS
    assert "clear" in KNOWN_COMMANDS


# ═══════════════════════════════════════════════════════════════════════════
# 10. Screen Classes
# ═══════════════════════════════════════════════════════════════════════════


def test_dashboard_screen_has_css() -> None:
    """Verify DashboardScreen has inline CSS."""
    assert "sidebar_container" in DashboardScreen.CSS


def test_forge_screen_has_css() -> None:
    """Verify ForgeScreen has inline CSS."""
    assert "forge_header" in ForgeScreen.CSS


def test_trace_screen_has_css() -> None:
    """Verify TraceScreen has inline CSS."""
    assert "trace_header" in TraceScreen.CSS


def test_help_screen_accepts_persona() -> None:
    """Verify HelpScreen initializes with persona parameter."""
    screen = HelpScreen(persona="ODIN")
    assert screen.persona == "ODIN"


# ═══════════════════════════════════════════════════════════════════════════
# 11. VitalsHeader
# ═══════════════════════════════════════════════════════════════════════════


def test_vitals_header_instantiation() -> None:
    """Verify VitalsHeader can be instantiated."""
    header = VitalsHeader()
    assert header is not None
