from src.core.engine.vector import SovereignVector

engine = SovereignVector()
queries = ["complete work"]

for query in queries:
    results = engine.search(query)
    print(f"\nQuery: {query}")
    for r in results:
        print(f" -> Trigger: {r['trigger']}, Score: {r['score']:.4f}, Note: {r['note']}")
