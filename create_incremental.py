import json
import random

def generate_cases(n=100, min_score=0.80):
    test_cases = []

    intents = {
        "/lets-go": {
            "verbs": ["start", "begin", "initiate", "resume", "launch", "kick off", "fire up", "spin up"],
            "nouns": ["session", "workspace", "workflow", "process"],
        },
        "/run-task": {
            "verbs": ["create", "build", "make", "implement", "develop", "generate", "construct"],
            "nouns": ["page", "component", "feature", "logic", "api", "endpoint"],
        },
        "/investigate": {
            "verbs": ["check", "investigate", "debug", "audit", "analyze", "look into", "fix", "diagnose"],
            "nouns": ["bug", "issue", "error", "auth", "crash", "latency", "failure", "anomaly"],
        },
        "/wrap-it-up": {
            "verbs": ["finish", "complete", "finalize", "end", "stop", "close", "wrap up"],
            "nouns": ["day", "handshake", "archive"],
        },
        "SovereignFish": {
            "verbs": ["polish", "refine", "improve", "clean", "beautify", "enhance"],
            "nouns": ["visuals", "aesthetics", "layout", "code style"],
        },
        "/plan": {
            "verbs": ["plan", "design", "architect", "outline", "blueprint", "strategize"],
            "nouns": ["system", "architecture", "strategy", "roadmap", "module"],
        },
        "/test": {
            "verbs": ["test", "verify", "validate", "benchmark", "probe"],
            "nouns": ["code", "integrity", "performance", "coverage", "reliability"],
        },
        "GLOBAL:deployment-skill": {
            "verbs": ["deploy", "launch", "publish", "push", "release", "ship"],
            "nouns": ["app", "site", "production", "server", "live environment"],
        },
        "GLOBAL:playwright-e2e": {
            "verbs": ["run", "execute", "perform", "trigger"],
            "nouns": ["e2e tests", "browser automation", "playwright tests", "integration tests"],
        },
        "GLOBAL:ui-sci-fi": {
            "verbs": ["apply", "transform", "stylize", "inject"],
            "nouns": ["sci-fi look", "futuristic style", "neon glow", "glass aesthetics", "holographic"],
        },
        "GLOBAL:agent-health": {
            "verbs": ["check", "monitor", "report"],
            "nouns": ["health", "heartbeat", "pulse", "drift", "anomaly score", "system status"],
        },
        "GLOBAL:agent-lightning": {
            "verbs": ["optimize", "speed up", "accelerate"],
            "nouns": ["inference", "performance", "latency", "response time", "execution speed"],
        }
    }

    # Generate exact combinations
    combos = []
    for intent, data in intents.items():
        for v in data['verbs']:
            for noun in data['nouns']:
                combos.append({
                    "query": f"{v} {noun}",
                    "expected": intent,
                    "min_score": min_score,
                    "expected_mode": "vector",
                    "tags": ["generated"]
                })
                combos.append({
                    "query": f"please {v} the {noun}",
                    "expected": intent,
                    "min_score": min_score,
                    "expected_mode": "vector",
                    "tags": ["generated"]
                })
                combos.append({
                    "query": f"I want to {v} the {noun}",
                    "expected": intent,
                    "min_score": min_score,
                    "expected_mode": "vector",
                    "tags": ["generated"]
                })
                
    random.shuffle(combos)
    
    output = {
        "baseline_accuracy": 100.0,
        "test_cases": combos[:n]
    }

    output_path = f"fishtest_N{n}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Generated {n} test cases in {output_path}")

if __name__ == "__main__":
    import sys
    try:
        n_val = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    except ValueError:
        n_val = 100
    generate_cases(int(n_val))
