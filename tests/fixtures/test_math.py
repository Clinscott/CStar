import math
import re


def tokenize(text):
    return re.findall(r"\w+", text.lower())

skills = {
    "GLOBAL:ui-sci-fi": "# UI Sci-Fi Skill\n\nActivation Words: futuristic, holographic, interface, glow, sci-fi"
}

vocab = set()
for text in skills.values():
    vocab.update(tokenize(text))

print(f"Vocab: {vocab}")

num_docs = len(skills)
doc_counts = {word: 0 for word in vocab}
for text in skills.values():
    words = set(tokenize(text))
    for word in words:
        doc_counts[word] += 1

idf = {}
for word, count in doc_counts.items():
    idf[word] = math.log(num_docs / (1 + count)) + 1

def vectorize(tokens):
    counts = {}
    for t in tokens: 
        if t in vocab: counts[t] = counts.get(t, 0) + 1
    vector = []
    for word in sorted(vocab):
        tf = counts.get(word, 0) / (len(tokens) or 1)
        vector.append(tf * idf.get(word, 0))
    return vector

def similarity(v1, v2):
    dot = sum(a*b for a, b in zip(v1, v2))
    mag1 = math.sqrt(sum(a*a for a in v1))
    mag2 = math.sqrt(sum(b*b for b in v2))
    if mag1 == 0 or mag2 == 0: return 0
    return dot / (mag1 * mag2)

s_vec = vectorize(tokenize(skills["GLOBAL:ui-sci-fi"]))
q_vec = vectorize(tokenize("futuristic holographic interface"))

print(f"S-Vec: {s_vec}")
print(f"Q-Vec: {q_vec}")
print(f"Similarity: {similarity(s_vec, q_vec)}")
