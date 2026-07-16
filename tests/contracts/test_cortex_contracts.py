import unittest
from pathlib import Path
from unittest.mock import patch

from src.core.engine.cortex import (
    LEGACY_CORTEX_RUNTIME_ERROR,
    Cortex,
    parse_cortex_sections,
)


class TestCortexContracts(unittest.TestCase):
    def test_detached_parser_contract(self) -> None:
        rows = parse_cortex_sections("Rules", "# Safety\nPreserve operator gates.")
        self.assertEqual(rows, [("Rules > Safety", "Preserve operator gates.")])

    @patch("pathlib.Path.exists")
    @patch("pathlib.Path.read_text")
    def test_runtime_contract_is_retired(
        self,
        mock_read_text,
        mock_exists,
    ) -> None:
        with self.assertRaisesRegex(RuntimeError, f"^{LEGACY_CORTEX_RUNTIME_ERROR}$"):
            Cortex(Path("/synthetic/project"), Path("/synthetic/base"))
        mock_exists.assert_not_called()
        mock_read_text.assert_not_called()


if __name__ == "__main__":
    unittest.main()
