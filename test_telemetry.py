import requests
import json
import time

def test_trace():
    payload = {
        "mission_id": "test-manual-trace",
        "file_path": "test.py",
        "target_metric": "LOGIC",
        "initial_score": 5.0,
        "final_score": 0.0,
        "justification": "Manual verification of telemetry pipeline.",
        "status": "STARTED",
        "timestamp": int(time.time() * 1000)
    }
    
    url = "http://127.0.0.1:4000/api/telemetry/trace"
    
    print(f"Sending to {url}...")
    try:
        response = requests.post(url, json=payload, timeout=5.0)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_trace()
