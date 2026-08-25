import sys
from pathlib import Path
_PROJECT_ROOT = Path(r"C:\Users\Craig\Corvus\CorvusStar").resolve()
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import pytest
def test_pass(): assert True
