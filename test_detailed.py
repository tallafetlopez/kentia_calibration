import requests
import json

# Test de login con detalles
response = requests.post(
    'http://localhost:8000/api/auth/login',
    json={'email': 'admin@herko.dev', 'password': 'password123'},
    timeout=5
)

print(f"Status Code: {response.status_code}")
print(f"Response Headers:")
for key, value in response.headers.items():
    print(f"  {key}: {value}")
print(f"\nResponse Body:")
print(f"  Raw: {response.text}")
print(f"  Bytes: {response.content}")

# Si hay JSON, tratar de parsearlo
if response.headers.get('content-type', '').startswith('application/json'):
    try:
        print(f"  JSON: {response.json()}")
    except:
        pass
