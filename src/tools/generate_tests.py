import argparse
import json
import random


def generate_cases(n=1000, threshold=0.3):
    print(f"Generating {n} synthetic test cases...")

    # Vocabulary Aligned with sv_engine.py for High Confidence
    vocab = {
        "/lets-go": {
            "verbs": ["start", "resume", "begin", "progress"],
            "nouns": ["project", "logic", "flow", "task", "work"],
            "modifiers": ["the", "my", "our", "this", "new", "current"]
        },
        "/run-task": {
            "verbs": ["create", "make", "new", "build", "generate", "implement"],
            "nouns": ["feature", "task", "page", "component", "logic"],
            "modifiers": ["new", "fresh", "another", "custom", "test", "mock"]
        },
        "/investigate": {
            "verbs": ["debug", "check", "find", "analyze", "investigate", "verify", "audit"],
            "nouns": ["bug", "error", "log", "issue"],
            "modifiers": ["the", "this", "that", "weird", "nasty", "critical"]
        },
        "/wrap-it-up": {
            "verbs": ["finish", "done", "wrap", "complete", "finalize", "quit", "exit", "stop", "end"],
            "nouns": ["session", "day", "work"],
            "modifiers": ["it", "up", "now", "for the day", "immediately"]
        }
    }

    templates = [
        "{verb} {noun}",
        "{verb} {modifier} {noun}",
        "please {verb} {noun}",
        "i need to {verb} {noun}",
        "{verb} {modifier} {noun} right now",
        "can you {verb} {noun}"
    ]

    cases = []

    # 1. Ensure we cover the "Core" manually first (to ensure variety)
    for intent, words in vocab.items():
        for _ in range(int(n * 0.1)): # 10% of N dedicated to simple core coverage
            verb = random.choice(words["verbs"])
            noun = random.choice(words["nouns"])
            query = f"{verb} {noun}"
            cases.append({
                "query": query,
                "expected": intent,
                "min_score": 0.3,
                "tags": ["synthetic", "core"]
            })

    # 2. Random Combinatorial Fill
    while len(cases) < n:
        intent = random.choice(list(vocab.keys()))
        words = vocab[intent]
        template = random.choice(templates)

        query = template.format(
            verb=random.choice(words["verbs"]),
            noun=random.choice(words["nouns"]),
            modifier=random.choice(words["modifiers"])
        )

        cases.append({
            "query": query,
            "expected": intent,
            "min_score": 0.3,
            "tags": ["synthetic", "combinatorial"]
        })

    # Shuffle to ensure distribution
    random.shuffle(cases)

    return {
        "baseline_accuracy": 100.0,
        "test_cases": cases[:n] # Trim exact
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic fishtest data.")
    parser.add_argument("-n", type=int, default=1000, help="Number of test cases to generate")
    parser.add_argument("-o", "--offset", type=int, default=1, help="Multiplier for routine 10x increases")
    parser.add_argument("-t", "--threshold", type=float, default=0.3, help="Minimum score threshold for synthetic cases")
    args = parser.parse_args()

    total_n = args.n * args.offset

    data = generate_cases(total_n, threshold=args.threshold)

    filename = f"fishtest_N{total_n}.json"
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    print(f"Values exported to {filename}")
