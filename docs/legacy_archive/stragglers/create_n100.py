import json

source = r"C:\Users\Craig\Corvus\CorvusStar\tests\fixtures\fishtest_N1000.json"
dest = r"C:\Users\Craig\Corvus\CorvusStar\tests\fixtures\fishtest_N100.json"

with open(source, encoding='utf-8') as f:
    data = json.load(f)

data['test_cases'] = data['test_cases'][:100]

with open(dest, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

print(f"Created {dest} with {len(data['test_cases'])} cases.")
