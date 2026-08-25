"""Detached SPRT calculus and a retired filesystem-watcher compatibility API."""

import math
from pathlib import Path


LEGACY_STABILITY_WATCHER_ERROR = (
    "legacy_python_stability_watcher_retired_use_cstar_kernel"
)


class GungnirValidator:
    """
    [THE GUNGNIR CALCULUS]
    Lore: "The Infallible Strike."
    Purpose: Statistically verify hypothesis (fix is stable) vs (fix is flaky).
    """
    def __init__(self, alpha: float = 0.05, beta: float = 0.1, p0: float = 0.01, p1: float = 0.2) -> None:
        """
        Initializes the SPRT validator with error boundaries and hypothesis probabilities.

        Args:
            alpha: Probability of Type I error (False Positive).
            beta: Probability of Type II error (False Negative).
            p0: Base failure rate (Null Hypothesis).
            p1: Flaky failure rate (Alternative Hypothesis).
        """
        self.alpha = alpha
        self.beta = beta
        self.p0 = p0
        self.p1 = p1

        # Thresholds
        self.A = (1 - beta) / alpha
        self.B = beta / (1 - alpha)

        self.log_likelihood_ratio = 0.0

    def record_trial(self, success: bool) -> None:
        """
        Calculates the Wald Likelihood Ratio for the current trial.

        ln(L1/L0) = k*ln(p1/p0) + (n-k)*ln((1-p1)/(1-p0))

        Args:
            success: Whether the trial passed.
        """
        if success:
            self.log_likelihood_ratio += math.log((1 - self.p1) / (1 - self.p0))
        else:
            self.log_likelihood_ratio += math.log(self.p1 / self.p0)

    @property
    def status(self) -> str:
        """
        Determines the current status of the SPRT test.

        Returns:
            "REJECT" if the alternative hypothesis (flaky) is accepted.
            "ACCEPT" if the null hypothesis (stable) is accepted.
            "CONTINUE" if more trials are needed.
        """
        if self.log_likelihood_ratio >= math.log(self.A):
            return "REJECT"  # Null hypothesis rejected -> Flaky
        if self.log_likelihood_ratio <= math.log(self.B):
            return "ACCEPT"  # Null hypothesis accepted -> Stable
        return "CONTINUE"


class TheWatcher:
    """Import-compatible tombstone for the former autonomous state watcher."""

    def __init__(self, root: Path) -> None:
        del root
        raise RuntimeError(LEGACY_STABILITY_WATCHER_ERROR)
