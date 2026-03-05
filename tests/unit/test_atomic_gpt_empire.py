from src.core.engine.atomic_gpt import AnomalyWarden, SessionWarden


def test_anomaly_warden_forward_empire():
    """[Ω] Verifies forward pass of AnomalyWarden (Empire Standard)."""
    warden = AnomalyWarden()
    warden.eval() # Deterministic
    # Inputs: [latency, tokens, loops, errors, lore_alignment]
    x = [100.0, 500.0, 10.0, 0.0, 0.95]
    prob = warden.forward(x)
    assert 0.0 <= prob <= 1.0

def test_anomaly_warden_train_step_empire():
    """[Ω] Verifies training step of AnomalyWarden (Empire Standard)."""
    warden = AnomalyWarden()
    warden.train()
    # Inputs: [latency, tokens, loops, errors, lore_alignment]
    x = [1000.0, 5000.0, 50.0, 1.0, 0.1] # High anomaly
    y = 1.0 # Anomaly

    warden.forward(x)
    for _ in range(10):
        warden.train_step(x, y)

    final_prob = warden.forward(x)
    assert 0.0 <= final_prob <= 1.0

def test_session_warden_forward_empire():
    """[Ω] Verifies forward pass of SessionWarden (Empire Standard)."""
    warden = SessionWarden()
    warden.eval()
    x = [0.9, 100.0, 0.01]
    prob = warden.forward(x)
    assert 0.0 <= prob <= 1.0
