from src.games.odin_protocol.engine.rng import TacticalRNG


def test_tactical_rng_bounds():
    """Verifies RNG output bounds."""
    for _ in range(100):
        val = TacticalRNG.random()
        assert 0.0 <= val <= 1.0

        u = TacticalRNG.uniform(5, 10)
        assert 5.0 <= u <= 10.0

        r = TacticalRNG.randint(1, 3)
        assert 1 <= r <= 3

def test_tactical_rng_choice():
    """Verifies choice logic."""
    seq = [1, 2, 3]
    assert TacticalRNG.choice(seq) in seq
    assert TacticalRNG.secure_choice(seq) in seq
