import json
import random


def generate_n10000(target_n=10000):
    test_cases = []

    # 1. INTENT REGISTRY
    intents = {
        "/lets-go": {
            "verbs": ["start", "begin", "initiate", "resume", "launch", "kick off", "fire up", "spin up", "go", "reboot", "reactivate", "jump in"],
            "nouns": ["project", "session", "work", "environment", "dev setup", "store", "catalog", "workspace", "terminal", "workflow", "process"],
            "tags": ["tier-1", "core"]
        },
        "/run-task": {
            "verbs": ["create", "build", "make", "implement", "develop", "add", "generate", "construct", "deploy", "setup", "instantiate", "produce", "craft"],
            "nouns": ["page", "component", "feature", "logic", "dashboard", "checkout", "ui", "footer", "header", "modal", "api", "endpoint", "database schema"],
            "tags": ["tier-1", "core"]
        },
        "/investigate": {
            "verbs": ["check", "investigate", "debug", "audit", "analyze", "look into", "fix", "inspect", "scrutinize", "diagnose", "examine", "trace", "hunt"],
            "nouns": ["bug", "issue", "error", "auth", "login", "crash", "latency", "failure", "bottleneck", "anomaly", "regression", "leak", "security flaw"],
            "tags": ["tier-1", "core"]
        },
        "/wrap-it-up": {
            "verbs": ["finish", "complete", "finalize", "end", "stop", "close", "wrap up", "call it a day", "shutdown", "terminate", "conclude", "archive"],
            "nouns": ["work", "session", "project", "day", "task", "development cycle", "handshake"],
            "tags": ["tier-1", "core"]
        },
        "SovereignFish": {
            "verbs": ["polish", "refine", "improve", "clean", "beautify", "enhance", "sanitize", "standardize", "tune", "optimize", "buff", "perfect"],
            "nouns": ["visuals", "aesthetics", "ui", "design", "layout", "ux", "interface", "code style", "formatting", "document structure"],
            "tags": ["tier-1", "polish"]
        },
        "/plan": {
            "verbs": ["plan", "design", "architect", "outline", "blueprint", "map out", "strategize", "forecast", "conceptualize", "draft"],
            "nouns": ["system", "architecture", "strategy", "implementation", "module", "roadmap", "infrastructure", "scaling plan", "logic flow"],
            "tags": ["tier-2", "planning"]
        },
        "/test": {
            "verbs": ["test", "verify", "validate", "check", "benchmark", "smoke test", "fuzz", "probe"],
            "nouns": ["code", "integrity", "performance", "unit tests", "coverage", "reliability", "contract", "api stability"],
            "tags": ["tier-2", "testing"]
        },
        "GLOBAL:deployment-skill": {
            "verbs": ["deploy", "launch", "publish", "push", "release", "ship", "provision", "distribute"],
            "nouns": ["app", "site", "production", "server", "live environment", "cloud", "instance", "deployment pipeline"],
            "tags": ["tier-2", "deployment"]
        },
        "GLOBAL:playwright-e2e": {
            "verbs": ["run", "execute", "start", "perform", "trigger"],
            "nouns": ["e2e tests", "browser automation", "playwright tests", "ui tests", "integration tests", "automated flows"],
            "tags": ["tier-3", "e2e"]
        },
        "GLOBAL:git-assistant": {
            "verbs": ["git", "commit", "push", "pull", "rebase", "merge", "branch", "checkout", "fetch", "stash"],
            "nouns": ["branch", "repository", "changes", "conflict", "origin", "upstream", "commit history"],
            "tags": ["tier-3", "git"]
        },
        "GLOBAL:ui-sci-fi": {
            "verbs": ["make", "add", "apply", "give", "transform", "stylize", "inject"],
            "nouns": ["sci-fi look", "futuristic style", "neon glow", "glass aesthetics", "holographic", "cyberpunk theme", "terminal ui"],
            "tags": ["tier-3", "ui"]
        },
        "GLOBAL:agent-health": {
            "verbs": ["check", "monitor", "audit", "report"],
            "nouns": ["health", "heartbeat", "pulse", "drift", "anomaly score", "system status"],
            "tags": ["tier-3", "health"]
        },
        "GLOBAL:agent-lightning": {
            "verbs": ["optimize", "speed up", "accelerate", "benchmark"],
            "nouns": ["inference", "performance", "latency", "response time", "execution speed"],
            "tags": ["tier-3", "lightning"]
        }
    }

    # 2. GENERATION LOGIC

    # 2.1 Combinatorial Expansion
    for intent, data in intents.items():
        # High volume for core intents
        count = 600 if "tier-1" in data['tags'] else 350
        for _ in range(count):
            v = random.choice(data['verbs'])
            n = random.choice(data['nouns'])

            # Diverse structures
            moods = [
                f"{v} the {n}",
                f"can you {v} the {n}?",
                f"I want to {v} the {n}",
                f"{n} {v}",
                f"please {v} our {n} now",
                f"time to {v} {n}",
                f"help me {v} the {n}",
                f"need to {v} {n} today",
                f"go ahead and {v} {n}",
                f"exec {v} on {n}"
            ]
            query = random.choice(moods)

            test_cases.append({
                "query": query,
                "expected": intent,
                "min_score": 0.80,
                "expected_mode": "vector",
                "tags": data['tags'] + ["generated"]
            })

    # 2.2 Unknown / Novel Queries
    unknowns = [
        "set up a kubernetes cluster", "provision an aws lambda function",
        "optimize my sql database indexes", "create a rust microservice",
        "how do i cook a steak", "what is the capital of france",
        "configure an nginx reverse proxy", "deploy to google cloud run",
        "write a python script to scrape wikipedia", "build a machine learning model"
    ]
    for u in unknowns:
        test_cases.append({
            "query": u,
            "expected": None,
            "max_score": 0.69, # Must score BELOW the threshold
            "expected_mode": "none",
            "tags": ["unknown"]
        })

    # 2.3 Fill to N=10000 with noise and mutations
    while len(test_cases) < target_n:
        base = random.choice(test_cases)
        if base.get('tags') and 'unknown' in base['tags']: continue # Don't mutate unknowns heavily
        if base['expected'] is None: continue # Don't duplicate traps too much

        query = base['query']
        # Mutation types
        r = random.random()
        if r > 0.9: # Typo
            if len(query) > 5:
                idx = random.randint(0, len(query)-1)
                query = query[:idx] + query[idx+1:]
        elif r > 0.8: # Double space
            query = query.replace(" ", "  ")
        elif r > 0.7: # Case swap
            query = query.swapcase()
        elif r > 0.6: # Prefix noise
            query = random.choice(["um, ", "hey, ", "so ", "ok "]) + query

        test_cases.append({
            "query": query,
            "expected": base['expected'],
            "min_score": 0.70, # Honest semantic threshold
            "expected_mode": base['expected_mode'],
            "tags": base['tags'] + ["mutated"]
        })

    # FINAL SHUFFLE
    random.shuffle(test_cases)

    output = {
        "baseline_accuracy": 100.0,
        "test_cases": test_cases[:target_n]
    }

    output_path = f"fishtest_N{target_n}_mutated.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Generated {len(test_cases[:target_n])} test cases in {output_path}")

if __name__ == "__main__":
    import sys
    try:
        n_val = int(sys.argv[1]) if len(sys.argv) > 1 else 10000
    except ValueError:
        n_val = 10000
    generate_n10000(n_val)
