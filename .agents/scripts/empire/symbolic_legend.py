import json
import os


class SymbolicLegend:
    """
    [Ω] THE REPOSITORY OF SYMBOLS
    Maps shorthand tokens to complex state objects.
    """

    def __init__(self, legend_file: str = None):
        self.legend_file = legend_file or os.path.join(os.path.dirname(__file__), "legend.json")
        self.symbols = self._load()

    def _load(self):
        if os.path.exists(self.legend_file):
            with open(self.legend_file, encoding="utf-8") as f:
                return json.load(f)
        return {
            "[$]": {"type": "user", "tier": "premium", "balance": 1000},
            "[#]": {"type": "item", "weight": 50, "status": "sealed"}
        }

    def resolve(self, token: str):
        """Expand a symbol into its object representation."""
        return self.symbols.get(token, token)

    def save(self):
        with open(self.legend_file, "w", encoding="utf-8") as f:
            json.dump(self.symbols, f, indent=4)

if __name__ == "__main__":
    legend = SymbolicLegend()
    print(f"[Ω] LEGEND LOADED: {list(legend.symbols.keys())}")
