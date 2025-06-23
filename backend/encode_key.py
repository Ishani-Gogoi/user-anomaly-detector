import base64

with open("serviceAccountKey.json", "rb") as f:
    encoded = base64.b64encode(f.read()).decode()
    print(encoded)
