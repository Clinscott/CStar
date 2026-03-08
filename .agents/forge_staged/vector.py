class SovereignVector:
    # ... existing code ...
    def apply_evolution_delta(self, term_deltas, domain_deltas):
        """Applies updates from Ouroboros to the live engine."""
        for term, delta in term_deltas.items():
            self.weights[term] *= (1 + delta)
        for domain, delta in domain_deltas.items():
            self.domain_gravity[domain] += delta
        self._rebuild_cache()