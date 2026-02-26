import sys

sys.path.insert(0, '.agent/scripts')

from engine.vector import SovereignVector

e = SovereignVector(
    'thesaurus.qmd',
    '.agent/corrections.json',
    '.agent/scripts/stopwords.json'
)
e.load_core_skills()
e.build_index()

def search_and_print(query):
    r = e.search(query)
    if r:
        print(f"Query: {query}")
        print(f"  Score: {r[0]['score']:.4f}, Trigger: {r[0]['trigger']}")
        return {"query": query, "score": r[0]['score'], "trigger": r[0]['trigger']}
    else:
        print(f"Query: {query} -> No results")
        return {"query": query, "result": "No results"}


if __name__ == '__main__':
    # CJK Query: "部署" (deploy)
    q1 = "部署"
    result1 = search_and_print(q1)

    # Non-existent CJK term
    q2 = "不存在的词语"
    result2 = search_and_print(q2)
