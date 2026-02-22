"""
[Freya: BEAUTY]
Lore: "The Goddess of Beauty sees all imperfections."
Purpose: Hunt for visual improvements — hover states, spacing, polish, and Tailwind best practices.
"""

import contextlib
import json
import re
from typing import Any

from src.sentinel.wardens.base import BaseWarden


class FreyaWarden(BaseWarden):
    def scan(self) -> list[dict[str, Any]]:
        targets = []

        # Load color theory for validation
        theory_path = self.root / "src" / "core" / "color_theory.json"
        theory = {}
        all_hexes = []
        if theory_path.exists():
            with contextlib.suppress(Exception):
                theory = json.loads(theory_path.read_text(encoding='utf-8'))
                palettes = theory.get("palettes", {})
                for p in palettes.values():
                    all_hexes.extend([v.lower() for v in p.values()])

        for tsx_file in self.root.rglob("*.tsx"):
            if self._should_ignore(tsx_file):
                continue

            with contextlib.suppress(Exception):
                content = tsx_file.read_text(encoding='utf-8')

                # --- [GUNGNIR CALCULUS: BIRKHOFF MEASURE] ---
                # 1. Calculate Complexity (C)
                elements = re.findall(r'<[a-zA-Z0-9]+', content)
                total_elements = len(elements)

                class_matches = re.findall(r'className=["\']([^"\']+)["\']', content)
                all_classes = []
                for match in class_matches:
                    all_classes.extend(match.split())

                unique_classes = len(set(all_classes))
                complexity_C = total_elements + unique_classes
                if complexity_C == 0: complexity_C = 1 # Safety

                # 2. Calculate Order (O)
                symmetric_operators = {'flex', 'grid', 'justify-center', 'items-center', 'mx-auto', 'text-center'}
                order_O = 0

                class_counts = {cls: all_classes.count(cls) for cls in set(all_classes)}
                for cls, count in class_counts.items():
                    if count > 2:  # Reward repetition/harmony
                        order_O += count
                    if cls in symmetric_operators:
                        order_O += 5 * count  # Reward symmetric layout per instance

                # 3. Calculate M (Birkhoff's Measure)
                measure_M = order_O / complexity_C

                if measure_M < 0.3 and total_elements > 5:
                    targets.append({
                        "type": "FREYA_BIRKHOFF_BREACH",
                        "file": str(tsx_file.relative_to(self.root)),
                        "action": f"Aesthetic Calculus failure. Birkhoff Measure (M={measure_M:.2f}) indicates high complexity ({complexity_C}) without sufficient order ({order_O}). Refactor for symmetry.",
                        "line": 1,
                        "severity": "HIGH"
                    })

                # 4. Golden Ratio check (Arbitrary Pixels)
                arbitrary_classes = re.findall(r'-\[[0-9]+px\]', content)
                if len(arbitrary_classes) > 3:
                    targets.append({
                        "type": "FREYA_GOLDEN_RATIO_BREACH",
                        "file": str(tsx_file.relative_to(self.root)),
                        "action": "Golden Ratio alignment missing. Excessive arbitrary pixel values detected. Utilize native Tailwind Fibonacci scales for proportional harmony.",
                        "line": 1,
                        "severity": "HIGH"
                    })

                # --- Original Warden Checks ---
                lines = content.splitlines()
                for i, line in enumerate(lines):
                    # 1. Hover check
                    if "<button" in line and "className" in line and "hover:" not in line:
                        targets.append({
                            "type": "FREYA_HOVER_MISSING",
                            "file": str(tsx_file.relative_to(self.root)),
                            "action": "Add hover state to button (Linscott Standard)",
                            "line": i+1,
                            "severity": "MEDIUM"
                        })

                    # 3. Tailwind Arbitrary Values (Individual lines)
                    arbitrary = re.search(r"-\[.*?\]", line)
                    if arbitrary:
                        targets.append({
                            "type": "FREYA_TAILWIND_ARBITRARY",
                            "file": str(tsx_file.relative_to(self.root)),
                            "action": f"Replace arbitrary Tailwind value '{arbitrary.group(0)}' with design token",
                            "line": i+1,
                            "severity": "LOW"
                        })

                    # 4. Color Theory Audit (Hex matching)
                    if all_hexes:
                        found_hex = re.findall(r"#[0-9a-fA-F]{6}", line)
                        for h in found_hex:
                            if h.lower() not in all_hexes:
                                targets.append({
                                    "type": "FREYA_COLOR_DEVIANCE",
                                    "file": str(tsx_file.relative_to(self.root)),
                                    "action": f"Non-standard color detected: {h} (Consult color_theory.json)",
                                    "line": i+1,
                                    "severity": "LOW"
                                })



        return targets
