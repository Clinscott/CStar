import numpy as np
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.append(str(PROJECT_ROOT))

from src.core.engine.atomic_gpt import AnomalyWarden

def test_burn_in():
    print("┌──────────────────────────────────────────────────────────────────────────────┐")
    print("│  🔱 ANOMALY WARDEN BURN-IN VERIFICATION                                       │")
    print("└──────────────────────────────────────────────────────────────────────────────┘")
    
    # Force a fresh start
    model_path = Path(".agent/warden_test.pkl")
    if model_path.exists(): model_path.unlink()
    
    warden = AnomalyWarden(model_path=model_path)
    initial_cycles = warden.burn_in_cycles
    print(f"| Initial Burn-In Cycles: {initial_cycles}")
    
    # Simulate 50 "Healthy" cycles
    print("| Simulating 50 Healthy cycles...")
    for _ in range(50):
        warden.train_step([500.0, 10.0, 1.0, 0.0], 0.0)
    
    print(f"| Cycles remaining: {warden.burn_in_cycles}")
    assert warden.burn_in_cycles == initial_cycles - 50
    
    # Check Z-Score convergence
    print(f"| Running Mean (Latency): {warden.running_mean[0]:.2f} (Expected: ~500.0)")
    assert np.isclose(warden.running_mean[0], 500.0, atol=10.0)
    
    # Complete Burn-In
    print("| Completing Burn-In (50 more cycles)...")
    for _ in range(50):
        warden.train_step([500.0, 10.0, 1.0, 0.0], 0.0)
    
    print(f"| Cycles remaining: {warden.burn_in_cycles}")
    assert warden.burn_in_cycles == 0
    
    # Test Anomaly Detection
    # 0.0 should be "Normal" (trained on this)
    # Give it a massive outlier
    normal_prob = warden.forward([500.0, 10.0, 1.0, 0.0])
    anomaly_prob = warden.forward([5000.0, 100.0, 10.0, 1.0])
    
    print(f"| Normal Probability: {normal_prob:.4f}")
    print(f"| Anomaly Probability (Outlier): {anomaly_prob:.4f}")
    
    # Cleanup
    if model_path.exists(): model_path.unlink()
    
    print("└──────────────────────────────────────────────────────────────────────────────┘")
    print("✅ PASS: Burn-In protocol verified.")

if __name__ == "__main__":
    test_burn_in()
