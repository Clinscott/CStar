import math

from src.cstar.core.sprt import evaluate_candidate


def test_sprt_acceptance_baseline_hypothesis():
    """
    Given an observation array of [0,0,0,0,0,0,0,0,0,0], When the SPRT is invoked,
    Then the Decision must be 'Accept' (From legacy GungnirSPRT.Tests.ps1)
    """
    observations = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    result = evaluate_candidate(observations)

    assert result["Decision"] == "Accept"
    assert result["SamplesEvaluated"] == 10
    assert result["FinalLLR"] < math.log(0.20 / (1.0 - 0.05)) # B bound

def test_sprt_rejection_flaky_hypothesis():
    """
    Given an observation array of [1,1,0,1,1], When the SPRT is invoked, 
    Then the Decision must be 'Reject' (From legacy GungnirSPRT.Tests.ps1)
    """
    observations = [1, 1, 0, 1, 1]
    result = evaluate_candidate(observations)

    assert result["Decision"] == "Reject"
    assert result["SamplesEvaluated"] == 5
    assert result["FinalLLR"] > math.log((1.0 - 0.20) / 0.05) # A bound

def test_sprt_inconclusive_continue_evaluation():
    """
    Given an observation array of [0,1,0], When the SPRT is invoked, 
    Then the Decision must be 'Continue' (From legacy GungnirSPRT.Tests.ps1)
    """
    observations = [0, 1, 0]
    result = evaluate_candidate(observations)

    assert result["Decision"] == "Continue"
    assert result["SamplesEvaluated"] == 3

def test_sprt_empty_observations_edge_case():
    """
    Given an empty observation array, When the SPRT is invoked, 
    Then the Decision must be 'Continue' and gracefully handle division/iteration bounds.
    """
    observations = []
    result = evaluate_candidate(observations)

    assert result["Decision"] == "Continue"
    assert result["FinalLLR"] == 0.0
    assert result["SamplesEvaluated"] == 0
