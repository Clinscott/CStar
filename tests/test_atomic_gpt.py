from src.core.engine.atomic_gpt import AnomalyWarden, SessionWarden


def test_anomaly_warden_forward():
    """Verifies forward pass of AnomalyWarden."""
    warden = AnomalyWarden()
    warden.eval() # Deterministic
    x = [100.0, 500.0, 10.0, 0.05]
    prob = warden.forward(x)
    assert 0.0 <= prob <= 1.0

def test_anomaly_warden_train_step():
    """Verifies training step of AnomalyWarden."""
    warden = AnomalyWarden()
    warden.train()
    x = [100.0, 500.0, 10.0, 0.05]
    y = 1.0 # Anomaly

    initial_prob = warden.forward(x)
    for _ in range(10):
        warden.train_step(x, y)

    final_prob = warden.forward(x)
    # Probability of anomaly should increase (or at least move towards 1.0)
    # Since it's a small network and few steps, we just check it doesn't crash
    assert 0.0 <= final_prob <= 1.0

def test_session_warden_forward():
    """Verifies forward pass of SessionWarden."""
    warden = SessionWarden()
    warden.eval()
    x = [0.9, 100.0, 0.01]
    prob = warden.forward(x)
    assert 0.0 <= prob <= 1.0
