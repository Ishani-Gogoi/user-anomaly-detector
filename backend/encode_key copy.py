import json

# Paste your JSON content as a multi-line string
json_data = '''PASTE_YOUR_JSON_HERE'''

# Convert the string to a dictionary
data = json.loads(json_data)

# Replace the escaped newline characters in the private_key
data['private_key'] = data['private_key'].replace('\\n', '')

# Convert the entire dictionary to a single-line JSON string
single_line_json = json.dumps(data, separators=(',', ':'))

# Print or save the single-line JSON
print(single_line_json)
