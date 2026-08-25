import pytest

from src.tools.update_gemini_manifest import ManifestOrchestrator, update_manifest


ERROR = "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"


@pytest.mark.parametrize("invoke", [update_manifest, ManifestOrchestrator.execute])
def test_update_manifest_is_retired(invoke):
    with pytest.raises(RuntimeError, match=f"^{ERROR}$"):
        invoke()
