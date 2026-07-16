from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

from src.core.annex import HeimdallWarden
from src.core.edda import EddaWeaver
from src.core.engine.atomic_gpt import AnomalyWarden
from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.evolve_skill import execute_evolve
from src.core.engine.executor import SovereignExecutor
from src.core.engine.forge_candidate import ForgeCandidateRequest, stage_forge_candidate
from src.core.engine.injector import SovereignInjector
from src.core.engine.orchestrator import SovereignOrchestrator
from src.core.engine.ravens.coordinator import MissionCoordinator
from src.core.engine.ravens.git_spoke import GitSpoke
from src.core.engine.ravens.muninn import Muninn
from src.core.engine.ravens.muninn_crucible import MuninnCrucible
from src.core.engine.ravens.muninn_heart import MuninnHeart
from src.core.engine.ravens.muninn_memory import MuninnMemory
from src.core.engine.ravens.muninn_promotion import MuninnPromotion
from src.core.engine.ravens.repo_spoke import RepoSpoke
from src.core.engine.ravens.score_cohesion import CohesionScorer
from src.core.engine.skill_learning import materialize_skill_proposal
from src.core.engine.wardens.edda import EddaWarden
from src.core.engine.wardens.norn import NornWarden
from src.core.engine.wardens.shadow_forge import ShadowForgeWarden
from src.core.lease_manager import LeaseManager
from src.core.metrics import ProjectMetricsEngine
from src.core.norn_coordinator import NornCoordinator
from src.core.vitals_spoke import get_vitals
from src.cstar.core.rpc import SovereignRPC
from src.cstar.core.uplink import AntigravityUplink
from src.tools.debug.verify_fish import IntegrityVerifier, verify_system_integrity
from src.tools.update_gemini_manifest import ManifestOrchestrator, update_manifest
from tests.benchmarks.warden_latency import run_benchmark
from tests.harness.manual_learn import run_learning_cycle
from tests.harness.raven_proxy import RavenProxy
from tests.harness.stress_test import SovereignStressTest
from tests.harness.verify_loop_logic import run_autonomous_loop_verification


SOVEREIGN_ERROR = "legacy_python_sovereign_component_retired_use_cstar_kernel"
RAVENS_ERROR = "legacy_python_ravens_engine_retired_use_cstar_kernel"
AUTONOMOUS_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


@pytest.mark.parametrize(
    ("invoke", "error"),
    [
        (lambda: SovereignOrchestrator(None, None, {}, {}), SOVEREIGN_ERROR),
        (lambda: SovereignExecutor(None, None), SOVEREIGN_ERROR),
        (lambda: SovereignInjector(None, {}), SOVEREIGN_ERROR),
        (AnomalyWarden, SOVEREIGN_ERROR),
        (ProjectMetricsEngine, SOVEREIGN_ERROR),
        (lambda: ShadowForgeWarden("synthetic"), SOVEREIGN_ERROR),
        (lambda: BeadLedger("synthetic"), AUTONOMOUS_ERROR),
        (lambda: execute_evolve("synthetic"), AUTONOMOUS_ERROR),
        (
            lambda: stage_forge_candidate(
                "synthetic",
                ForgeCandidateRequest("b", "r", "s", "p", "why"),
                {"code": "pass"},
            ),
            AUTONOMOUS_ERROR,
        ),
        (lambda: materialize_skill_proposal("synthetic"), SOVEREIGN_ERROR),
        (lambda: NornCoordinator("synthetic"), AUTONOMOUS_ERROR),
        (lambda: NornWarden("synthetic"), AUTONOMOUS_ERROR),
        (lambda: LeaseManager("synthetic"), AUTONOMOUS_ERROR),
        (lambda: HeimdallWarden("synthetic"), AUTONOMOUS_ERROR),
        (lambda: EddaWeaver("synthetic", "synthetic"), AUTONOMOUS_ERROR),
        (lambda: EddaWarden("synthetic"), AUTONOMOUS_ERROR),
        (lambda: SovereignRPC("synthetic"), AUTONOMOUS_ERROR),
        (AntigravityUplink, AUTONOMOUS_ERROR),
        (get_vitals, AUTONOMOUS_ERROR),
        (update_manifest, AUTONOMOUS_ERROR),
        (ManifestOrchestrator, AUTONOMOUS_ERROR),
        (lambda: Muninn("synthetic"), RAVENS_ERROR),
        (lambda: MuninnHeart("synthetic", Mock()), RAVENS_ERROR),
        (lambda: MuninnCrucible("synthetic", Mock()), RAVENS_ERROR),
        (lambda: MuninnMemory("synthetic"), RAVENS_ERROR),
        (lambda: MuninnPromotion("synthetic"), RAVENS_ERROR),
        (lambda: MissionCoordinator("synthetic"), RAVENS_ERROR),
        (lambda: GitSpoke("synthetic"), RAVENS_ERROR),
        (lambda: RepoSpoke("synthetic", "ALFRED"), RAVENS_ERROR),
        (CohesionScorer, RAVENS_ERROR),
        (verify_system_integrity, RAVENS_ERROR),
        (IntegrityVerifier, RAVENS_ERROR),
        (RavenProxy, RAVENS_ERROR),
        (run_learning_cycle, RAVENS_ERROR),
        (run_autonomous_loop_verification, RAVENS_ERROR),
        (SovereignStressTest, RAVENS_ERROR),
        (run_benchmark, SOVEREIGN_ERROR),
    ],
)
def test_retired_constructors_and_actions_fail_before_external_effects(
    invoke, error
):
    callback = Mock()
    probes = []
    with ExitStack() as stack:
        for target in (
            "builtins.open",
            "pathlib.Path.exists",
            "pathlib.Path.read_text",
            "pathlib.Path.write_text",
            "pathlib.Path.mkdir",
            "pathlib.Path.rglob",
            "subprocess.run",
            "subprocess.Popen",
            "sqlite3.connect",
            "socket.socket",
            "urllib.request.urlopen",
            "os.system",
            "os.putenv",
        ):
            probes.append(stack.enter_context(patch(target)))
        with pytest.raises(RuntimeError, match=f"^{error}$"):
            invoke()

    callback.assert_not_called()
    for probe in probes:
        probe.assert_not_called()


def test_retired_sources_have_no_effectful_implementation() -> None:
    root = Path(__file__).resolve().parents[2]
    sources = [
        "src/core/engine/orchestrator.py",
        "src/core/engine/atomic_gpt.py",
        "src/core/engine/executor.py",
        "src/core/engine/injector.py",
        "src/core/metrics.py",
        "src/core/engine/wardens/shadow_forge.py",
        "src/core/engine/ravens/muninn.py",
        "src/core/engine/ravens/muninn_heart.py",
        "src/core/engine/ravens/muninn_memory.py",
        "src/core/engine/ravens/muninn_promotion.py",
        "src/core/engine/ravens/git_spoke.py",
        "src/core/engine/ravens/repo_spoke.py",
        "src/core/engine/ravens/score_cohesion.py",
        "src/core/engine/vector.py",
        "src/core/norn_coordinator.py",
        "src/core/lease_manager.py",
        "src/core/annex.py",
        "src/core/vitals_spoke.py",
        "src/core/engine/wardens/edda.py",
        "src/core/engine/wardens/norn.py",
        "src/cstar/core/rpc.py",
        "src/tools/update_gemini_manifest.py",
        "src/tools/debug/verify_fish.py",
        "tests/harness/raven_proxy.py",
        "tests/harness/manual_learn.py",
        "tests/harness/verify_loop_logic.py",
        "tests/harness/stress_test.py",
        "tests/benchmarks/warden_latency.py",
    ]
    forbidden = (
        "import subprocess",
        "subprocess.",
        "import sqlite3",
        "sqlite3.",
        "HallOfRecords",
        "AntigravityUplink",
        "mimir.",
        "os.environ",
        "dotenv",
        ".read_text(",
        ".write_text(",
        ".mkdir(",
        ".rglob(",
        "shutil",
    )
    for relative in sources:
        source = (root / relative).read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in source, (relative, token)
