import json

with open('vocabulary.json', 'r') as f:
    data = json.load(f)
    print(len(data))