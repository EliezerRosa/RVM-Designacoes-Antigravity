import re
import json

# Read TS file
with open('src/data/initialPublishers.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove export part
content = re.sub(r'export const initialPublishers = ', '', content)
# Remove comments
content = re.sub(r'//.*', '', content)
# Remove "as const"
content = re.sub(r'as const', '', content)
# Remove trailing semicolon and whitespace
content = content.strip().rstrip(';')

# Loose parsing to JSON (Python's eval is dangerous but fine for local trusted file, 
# but better to format it to valid JSON first)
# The file likely has keys without quotes. 
# Let's try to use regex to add quotes to keys.
# Keys are identifiers: id, name, gender, etc.
# pattern: (\w+): replaced by "$1":
content = re.sub(r'(\w+):', r'"\1":', content)
# Also single quotes to double quotes
content = content.replace("'", '"')
# Trailing commas might be an issue for standard JSON, but Python's eval handles them for dicts/lists usually? 
# No, json.loads is strict. eval is easier for "JS object to Python Dict"
# Re-reading content without the regex replace for quotes, evaluating as python structure (since valid JS obj is close to Python dict, except true/false)

with open('src/data/initialPublishers.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Pre-processing for Python eval
content = re.sub(r'export const initialPublishers = ', '', content)
content = re.sub(r'//.*', '', content)
content = re.sub(r'as const', '', content)
content = content.strip().rstrip(';')
# Replace booleans
content = content.replace('true', 'True').replace('false', 'False')
# Eval
data = eval(content)

# Write to JSON
with open('src/data/publishers.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4, ensure_ascii=False)

print("Converted publishers.json")

# Create participations.json
with open('src/data/participations.json', 'w', encoding='utf-8') as f:
    json.dump([], f)
print("Created participations.json")
