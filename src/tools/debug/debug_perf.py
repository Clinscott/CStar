
import time
import sys
import os

# Add path to agent scripts
sys.path.append(os.path.join(os.getcwd(), '.agent', 'scripts'))

from sv_engine import SovereignVector

def profile():
    print("Initializing Engine...")
    t0 = time.time()
    engine = SovereignVector(
        thesaurus_path="c:\\Users\\Craig\\Corvus\\CorvusStar\\thesaurus.qmd",
        corrections_path="c:\\Users\\Craig\\Corvus\\CorvusStar\\.agent\\corrections.json",
        stopwords_path="c:\\Users\\Craig\\Corvus\\CorvusStar\\.agent\\scripts\\stopwords.json"
    )
    engine.load_core_skills()
    engine.load_skills_from_dir("c:\\Users\\Craig\\Corvus\\CorvusStar\\.agent\\skills")
    # Load global if needed, but keeping it simple for now matching fishtest basic setup
    engine.build_index()
    t1 = time.time()
    print(f"Init Time: {(t1-t0)*1000:.2f} ms")

    print(f"Vocab Size: {len(engine.vocab)}")
    print(f"Skills Count: {len(engine.skills)}")
    print(f"Vectors Count: {len(engine.vectors)}")
    
    # Test Uncached
    print("\n--- Uncached Search Test (100 unique queries) ---")
    queries = [f"unique query test {i}" for i in range(100)]
    t_start = time.perf_counter()
    for q in queries:
        engine.search(q)
    t_end = time.perf_counter()
    avg_uncached = ((t_end - t_start) / 100) * 1000
    print(f"Avg Uncached Latency: {avg_uncached:.4f} ms")

    # Test Cached
    print("\n--- Cached Search Test (1000 repeats) ---")
    query = "test cached query"
    engine.search(query) # Warmup
    t_start = time.perf_counter()
    for _ in range(1000):
        engine.search(query)
    t_end = time.perf_counter()
    avg_cached = ((t_end - t_start) / 1000) * 1000
    print(f"Avg Cached Latency: {avg_cached:.4f} ms")

if __name__ == "__main__":
    profile()
