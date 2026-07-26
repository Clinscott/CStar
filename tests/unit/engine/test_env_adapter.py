import os
import sys
import unittest
from unittest.mock import patch

from src.core.engine.env_adapter import EnvAdapter, HostCapability


class EnvAdapterTest(unittest.TestCase):
    def test_supported_host_markers_enable_delegation(self) -> None:
        cases = (
            ("CODEX_SUBAGENTS", "true"),
            ("CLAUDE_SUBAGENTS", "true"),
            ("DROID_SUBAGENTS", "true"),
            ("CODEX_SHELL", "1"),
            ("CODEX_THREAD_ID", "thread-1"),
            ("DROID_CLI_ACTIVE", "true"),
            ("CORVUS_HOST_PROVIDER", "codex"),
            ("CORVUS_HOST_PROVIDER", "claude"),
            ("CORVUS_HOST_PROVIDER", "droid"),
        )

        for env_name, env_value in cases:
            with self.subTest(env_name=env_name, env_value=env_value):
                with patch.dict(os.environ, {env_name: env_value}, clear=True):
                    self.assertIs(EnvAdapter().capability, HostCapability.SUB_AGENTS)

    def test_legacy_gemini_subagent_flag_is_inert(self) -> None:
        with patch.dict(os.environ, {"GEMINI_CLI_SUBAGENTS": "true"}, clear=True):
            self.assertIs(EnvAdapter().capability, HostCapability.LOCAL_JIT)

    def test_loaded_legacy_gemini_module_is_inert(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.dict(sys.modules, {"google.gemini": object()}),
        ):
            self.assertIs(EnvAdapter().capability, HostCapability.LOCAL_JIT)
