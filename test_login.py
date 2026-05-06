import requests
import json

try:
    r = requests.post(
        'http://localhost:8000/api/auth/login',
        json={'email': 'admin@herko.dev', 'password': 'password123'},
        timeout=5
    )
    print(f"Status: {r.status_code}")
    print(f"Headers: {dict(r.headers)}")
    print(f"Body: {r.text}")
except Exception as e:
    print(f"Error: {e}")
