import sys
from pathlib import Path
_PROJECT_ROOT = Path(r"C:\Users\Craig\Corvus\CorvusStar").resolve()
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

{"code": "import pytest\nfrom src.core.metrics import ProjectMetricsEngine\n\ndef test_metrics_engine_has_docstring():\n    assert ProjectMetricsEngine.__doc__ is not None, 'ProjectMetricsEngine is missing a docstring.'\n"}
