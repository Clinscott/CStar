import sys
from pathlib import Path
_PROJECT_ROOT = Path(r"C:\Users\Craig\Corvus\CorvusStar").resolve()
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

{"code": "import pytest\nfrom pathlib import Path\nimport re\n\ndef test_neural_graph_type_safety():\n    path = Path('src/tools/pennyone/vis/components/NeuralGraph.tsx')\n    content = path.read_text(encoding='utf-8')\n    any_matches = re.findall(r':\\s*any\\b', content)\n    assert len(any_matches) == 0, f'Found {len(any_matches)} instances of unsafe \"any\" typing.'\n"}
