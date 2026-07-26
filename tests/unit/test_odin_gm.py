import hashlib
import inspect
import json
import os
import statistics
import time
import unittest
from unittest.mock import patch

from src.games.odin_protocol.engine.gm_client import OdinGM
from src.games.odin_protocol.engine.scenarios import SovereignScenarioEngine


ODIN_BENCHMARK_CASES = 1_000
ODIN_BENCHMARK_WARMUP_CASES = 100
ODIN_BENCHMARK_ROUNDS = 7
ODIN_BENCHMARK_SHA256 = (
    "ab85609ba92433a0ed09e07f5ce9a955399117e82b2329e4f6a4e76376b3ff9d"
)


def odin_benchmark_corpus(gm: OdinGM, count: int = ODIN_BENCHMARK_CASES) -> list[dict]:
    """Build the fixed corpus used for matched Odin performance measurements."""
    return [
        gm.generate_scenario(
            {
                "AESIR_MIGHT": float(8 + case_id % 7),
                "WISDOM": float(5 + (case_id * 3) % 11),
            },
            seed=f"ODIN-BENCH-{case_id % 97}",
            turn_id=case_id % 41,
            player_name=f"Warlord-{case_id % 13}",
        )
        for case_id in range(count)
    ]


def odin_benchmark_payload(gm: OdinGM, count: int = ODIN_BENCHMARK_CASES) -> bytes:
    """Canonicalize the fixed corpus as sorted compact UTF-8 JSON."""
    return json.dumps(
        odin_benchmark_corpus(gm, count),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def odin_benchmark_digest(gm: OdinGM) -> str:
    return hashlib.sha256(odin_benchmark_payload(gm)).hexdigest()


def run_odin_benchmark() -> dict[str, object]:
    """Warm up 100 cases, then time seven canonical 1,000-case rounds."""
    gm = OdinGM()
    odin_benchmark_payload(gm, ODIN_BENCHMARK_WARMUP_CASES)
    expected_digest = hashlib.sha256(odin_benchmark_payload(gm)).hexdigest()
    rounds_ms = []

    for _ in range(ODIN_BENCHMARK_ROUNDS):
        start = time.perf_counter()
        payload = odin_benchmark_payload(gm)
        rounds_ms.append((time.perf_counter() - start) * 1_000)
        digest = hashlib.sha256(payload).hexdigest()
        if digest != expected_digest:
            raise AssertionError(
                f"Odin benchmark was non-deterministic: {digest} != {expected_digest}"
            )

    return {
        "cases": ODIN_BENCHMARK_CASES,
        "sha256": expected_digest,
        "rounds_ms": sorted(rounds_ms),
        "median_ms": statistics.median(rounds_ms),
    }


class OdinGMTests(unittest.TestCase):
    def test_odin_gm_matches_sovereign_scenario_engine(self):
        gm = OdinGM()
        engine = SovereignScenarioEngine()
        stats = {"AESIR_MIGHT": 10.0}

        self.assertEqual(
            gm.generate_scenario(stats, "SEED", 1),
            engine.generate_scenario(stats, "SEED", 1),
        )
        self.assertEqual(
            gm.describe_outcome(
                {"planet_name": "Mars"},
                "Odin",
                "A",
                True,
            ),
            engine.get_outcome("Odin", "A", True),
        )
        self.assertEqual(gm.scientist_query(), engine.get_scientist_query())

    def test_odin_gm_preserves_the_thousand_case_baseline(self):
        self.assertEqual(odin_benchmark_digest(OdinGM()), ODIN_BENCHMARK_SHA256)

    def test_retired_provider_markers_cannot_change_odin_output(self):
        baseline = odin_benchmark_digest(OdinGM())
        marker_sets = [
            {"GOOGLE_API_KEY": "retired-google-key"},
            {"GEMINI_API_KEY": "retired-gemini-key"},
            {
                "GOOGLE_API_KEY": "retired-google-key",
                "GEMINI_API_KEY": "retired-gemini-key",
            },
        ]

        for markers in marker_sets:
            with self.subTest(markers=sorted(markers)):
                with patch.dict(os.environ, markers):
                    self.assertEqual(odin_benchmark_digest(OdinGM()), baseline)

    def test_odin_gm_has_no_remote_model_configuration(self):
        gm = OdinGM()
        self.assertEqual(list(inspect.signature(OdinGM).parameters), [])
        self.assertEqual(set(vars(gm)), {"agent_engine"})
