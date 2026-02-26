import json
import random


def generate_n1000():
    test_cases = []

    # 1. CORE INTENTS & THEIR PHRASES
    # (Simplified for the script, but capturing the diversity)

    intents = {
        "/lets-go": {
            "verbs": ["start", "begin", "initiate", "resume", "launch", "kick off", "fire up", "spin up", "go"],
            "nouns": ["project", "session", "work", "environment", "dev setup", "store", "catalog"],
            "tags": ["tier-1", "core"]
        },
        "/run-task": {
            "verbs": ["create", "build", "make", "implement", "develop", "add", "generate", "construct"],
            "nouns": ["page", "component", "feature", "logic", "dashboard", "checkout", "ui", "footer"],
            "tags": ["tier-1", "core"]
        },
        "/investigate": {
            "verbs": ["check", "investigate", "debug", "audit", "analyze", "look into", "fix", "inspect"],
            "nouns": ["bug", "issue", "error", "auth", "login", "crash", "latency", "failure"],
            "tags": ["tier-1", "core"]
        },
        "/wrap-it-up": {
            "verbs": ["finish", "complete", "finalize", "end", "stop", "close", "wrap up", "call it a day"],
            "nouns": ["work", "session", "project", "day", "task"],
            "tags": ["tier-1", "core"]
        },
        "SovereignFish": {
            "verbs": ["polish", "refine", "improve", "clean", "beautify", "enhance"],
            "nouns": ["visuals", "aesthetics", "ui", "design", "layout"],
            "tags": ["tier-1", "polish"]
        },
        "/plan": {
            "verbs": ["plan", "design", "architect", "outline", "blueprint", "map out"],
            "nouns": ["system", "architecture", "strategy", "implementation", "module"],
            "tags": ["tier-2", "planning"]
        },
        "/test": {
            "verbs": ["test", "verify", "validate", "check"],
            "nouns": ["code", "integrity", "performance", "unit tests", "coverage"],
            "tags": ["tier-2", "testing"]
        },
        "GLOBAL:deployment-skill": {
            "verbs": ["deploy", "launch", "publish", "push", "release", "ship"],
            "nouns": ["app", "site", "production", "server", "live environment"],
            "tags": ["tier-2", "deployment"]
        },
        "GLOBAL:playwright-e2e": {
            "verbs": ["run", "execute", "start"],
            "nouns": ["e2e tests", "browser automation", "playwright tests", "ui tests"],
            "tags": ["tier-3", "e2e"]
        },
        "GLOBAL:git-assistant": {
            "verbs": ["git", "commit", "push", "pull", "rebase", "merge"],
            "nouns": ["branch", "repository", "changes", "conflict"],
            "tags": ["tier-3", "git"]
        },
        "GLOBAL:ui-sci-fi": {
            "verbs": ["make", "add", "apply", "give"],
            "nouns": ["sci-fi look", "futuristic style", "neon glow", "glass aesthetics", "holographic"],
            "tags": ["tier-3", "ui"]
        }
    }

    future_skills = {
        "GLOBAL:doc-generator": ["generate docs", "write readme", "api documentation", "jsdoc strings"],
        "GLOBAL:test-scaffold": ["scaffold tests", "generate test template", "create test stubs"],
        "GLOBAL:perf-profiler": ["profile app", "measure latency", "performance benchmark", "bottleneck check"]
    }

    # 2. GENERATION LOGIC

    # 2.1 Core Expansion (Tier 1 & 2)
    for intent, data in intents.items():
        count = 60 if "tier-1" in data['tags'] else 35
        for _ in range(count):
            v = random.choice(data['verbs'])
            n = random.choice(data['nouns'])

            # Moods
            moods = [
                f"{v} the {n}",
                f"can you {v} the {n}?",
                f"I want to {v} the {n}",
                f"{n} {v}",
                f"please {v} our {n} now"
            ]
            query = random.choice(moods)

            test_cases.append({
                "query": query,
                "expected": intent,
                "min_score": 0.85,
                "expected_mode": "vector",
                "tags": data['tags'] + ["generated"]
            })

    # 2.2 Future Skills
    for intent, phrases in future_skills.items():
        for p in phrases:
            for _ in range(5):
                test_cases.append({
                    "query": f"{p} {random.choice(['now', 'please', 'for me', 'today'])}",
                    "expected": intent,
                    "min_score": 0.85,
                    "expected_mode": "vector",
                    "tags": ["tier-4", "future", "generated"]
                })

    # 2.3 Internationalization
    intl = [
        ("プロジェクトを始めて", "/lets-go"), ("バグを修正", "/investigate"),
        ("部署", "GLOBAL:deployment-skill"), ("テストを実行", "/test"),
        ("开始项目", "/lets-go"), ("检查错误", "/investigate"),
        ("запустить проект", "/lets-go"), ("исправить ошибку", "/investigate")
    ]
    for q, e in intl:
        for _ in range(5):
            test_cases.append({
                "query": q,
                "expected": e,
                "min_score": 0.80,
                "expected_mode": "vector",
                "tags": ["intl", "generated"]
            })

    # 2.4 Adversarial traps
    traps = [
        "wrap the gift nicely", "go to the store", "execute the order", "fish are tasty",
        "oracle database install", "test the water", "plan for dinner", "ship a package"
    ]
    for t in traps:
        test_cases.append({
            "query": t,
            "expected": None,
            "min_score": 0.0,
            "expected_mode": "none",
            "tags": ["adversarial"]
        })

    # Fill to 1000
    while len(test_cases) < 1000:
        # Add random variations or duplicates with typos
        base = random.choice(test_cases)
        new_query = base['query']
        if len(new_query) > 5 and random.random() > 0.8:
            idx = random.randint(0, len(new_query)-1)
            new_query = new_query[:idx] + new_query[idx+1:] # typo

        test_cases.append({
            "query": new_query,
            "expected": base['expected'],
            "min_score": base['min_score'],
            "expected_mode": base['expected_mode'],
            "tags": base['tags'] + ["filler"]
        })

    # SHUFFLE
    random.shuffle(test_cases)

    output = {
        "baseline_accuracy": 100.0,
        "test_cases": test_cases[:1000]
    }

    with open("fishtest_data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Generated {len(test_cases[:1000])} test cases.")

if __name__ == "__main__":
    generate_n1000()
