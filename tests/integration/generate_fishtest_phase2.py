import json
import random


def generate_phase2_cases():
    adversarial_cases = []
    ambiguity_cases = []

    # 1. 100 Adversarial Cases (False Positive Traps)
    # These should map to expected: null
    traps = [
        # /wrap-it-up traps
        "wrap the sandwich in foil", "gift wrap the present", "wrap the text around the image",
        "bubble wrap the fragile items", "wrap the wound with gauze", "wrap up the meeting in 5 minutes",
        "tortilla wrap with chicken", "wrap the wires together", "wrap the pipe to prevent freezing",
        "wrap the baby in a blanket",
        
        # /lets-go traps
        "start the engine", "begin the race", "initiate the launch sequence for the rocket",
        "kick off your shoes", "spin up the record player", "fire up the grill",
        "go to the store to buy milk", "lets go to the park", "resume your favorite movie",
        "starting line of the marathon",
        
        # /investigate traps
        "check the weather forecast", "investigate the cold case from 1950", "debug the garden hose",
        "audit the library books", "analyze the chemical reaction", "inspect the fruit for bruises",
        "look into the telescope for stars", "check the mailbox", "fix the broken chair",
        "find my keys in the house",
        
        # /run-task traps
        "build a sandcastle", "make a cup of coffee", "generate a random number",
        "implement a new diet plan", "create a drawing of a cat", "construct a lego tower",
        "add sugar to the tea", "develop a new hobby", "feature film casting",
        "logic puzzle for kids",
        
        # Skill-specific traps
        "playwright for the theater", "automation of the assembly line", "browser history check",
        "sci-fi movie reviews", "glow in the dark toys", "neon sign for the bar",
        "glass of water please", "holographic trading cards", "performance of the orchestra",
        "latency in the nervous system", "git your act together", "assistant manager of the bank",
        "deployment of troops to the border", "release the kraken", "ship a box via fedex",
        "publish a book of poetry", "push the door open", "pull the lever",
        "oracle database for the bank", "wisdom tooth extraction", "suggest a restaurant",
        "help me cross the street", "consult a doctor", "scaffold for the skyscraper",
        "documentation of the ancient ruins", "readme stories to the kids", "benchmark in the park",
        "profile of a suspect", "measure the length of the table"
    ]
    
    # Fill to 100 traps
    trap_pool = list(set(traps)) # Deduplicate
    count = min(100, len(trap_pool))
    sampled_queries = random.sample(trap_pool, count)
    
    for query in sampled_queries:
        adversarial_cases.append({
            "query": query,
            "expected": None,
            "min_score": 0.0,
            "expected_mode": "none",
            "tags": ["adversarial", "phase-2"]
        })

    # If still under 100, add some typo variations to fill
    while len(adversarial_cases) < 100:
        base = random.choice(adversarial_cases)['query']
        if len(base) > 5:
            idx = random.randint(0, len(base)-1)
            new_query = base[:idx] + base[idx+1:] # typo
            if new_query not in [c['query'] for c in adversarial_cases]:
                adversarial_cases.append({
                    "query": new_query,
                    "expected": None,
                    "min_score": 0.0,
                    "expected_mode": "none",
                    "tags": ["adversarial", "phase-2", "typo"]
                })


    # 2. 50 Ambiguity Cases (Intent Priority/Overlap)
    # These test if the engine chooses the *correct* one when multiple might match
    ambiguities = [
        ("run it", "/run-task"), # Could be playwright too
        ("execute tests", "/test"), # Could be playwright
        ("make updates", "/run-task"), # Could be SovereignFish
        ("improve the code", "SovereignFish"), # Could be /investigate
        ("verify everything", "/test"), # Could be /investigate
        ("start the app", "/lets-go"), # Could be /run-task
        ("finish the project", "/wrap-it-up"), # Could be GLOBAL:deployment-skill
        ("push changes", "GLOBAL:git-assistant"), # Could be GLOBAL:deployment-skill
        ("check health", "GLOBAL:agent-health"), # Could be /investigate
        ("build the site", "/run-task"), # Could be GLOBAL:deployment-skill
        ("launch", "/lets-go"), # Could be GLOBAL:deployment-skill
        ("deploy", "GLOBAL:deployment-skill"), # Could be /lets-go
        ("fix the bug", "/investigate"), # Could be /test
        ("polish", "SovereignFish"), # No unambiguous mapping, but let's test priority
        ("analyze", "/investigate"),
        ("plan", "/plan"),
        ("document", "GLOBAL:doc-generator")
    ]
    
    while len(ambiguity_cases) < 50:
        q, e = random.choice(ambiguities)
        prefixes = ["can you", "I want to", "please", "go and", "time to"]
        full_q = f"{random.choice(prefixes)} {q}"
        ambiguity_cases.append({
            "query": full_q,
            "expected": e,
            "min_score": 0.35, # Higher score required for ambiguity
            "expected_mode": "vector",
            "tags": ["ambiguity", "phase-2"]
        })

    # 3. Save to a separate file for verification
    output = {
        "baseline_accuracy": 0.0,
        "test_cases": adversarial_cases + ambiguity_cases
    }
    
    with open("fishtest_phase2_data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=4, ensure_ascii=False)
    
    print(f"Generated {len(output['test_cases'])} Phase 2 test cases.")

if __name__ == "__main__":
    generate_phase2_cases()
