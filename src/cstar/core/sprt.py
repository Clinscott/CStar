import math
from typing import Any


def evaluate_candidate(observations: list[int], p0: float = 0.05, p1: float = 0.20, alpha: float = 0.05, beta: float = 0.20) -> dict[str, Any]:
    """
    Executes the Sequential Probability Ratio Test (SPRT) mathematically mirroring
    the legacy Gungnir calculus.

    Returns:
        dict: {"Decision": "Accept" | "Reject" | "Continue", "FinalLLR": float, "SamplesEvaluated": int}
    """
    if not observations:
        return {
            "Decision": "Continue",
            "FinalLLR": 0.0,
            "SamplesEvaluated": 0
        }

    try:
        # Lower Bound (B) = ln(Beta / (1 - Alpha))
        b_bound = math.log(beta / (1.0 - alpha))

        # Upper Bound (A) = ln((1 - Beta) / Alpha)
        a_bound = math.log((1.0 - beta) / alpha)

        final_llr = 0.0
        samples_evaluated = 0

        for obs in observations:
            samples_evaluated += 1
            # Log-Likelihood Ratio (LLR) calculation for Bernoulli
            # x = 1 (Fail), 0 (Pass)
            if obs == 1:
                final_llr += math.log(p1 / p0)
            else:
                final_llr += math.log((1.0 - p1) / (1.0 - p0))

        decision = "Continue"
        if final_llr >= a_bound:
            decision = "Reject"
        elif final_llr <= b_bound:
            decision = "Accept"

        return {
            "Decision": decision,
            "FinalLLR": final_llr,
            "SamplesEvaluated": samples_evaluated
        }

    except Exception as e:
        # Gungnir Calculus: Graceful failure shielding the Daemon
        return {
            "Decision": "Continue",
            "FinalLLR": 0.0,
            "SamplesEvaluated": len(observations),
            "Error": str(e)
        }
