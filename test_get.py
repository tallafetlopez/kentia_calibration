import requests

# Test GET /auth/roles
try:
    r = requests.get('http://localhost:8000/api/auth/roles', timeout=5)
    print(f"GET /auth/roles - Status: {r.status_code}")
    if r.status_code == 200:
        print(f"Response: {r.json()}")
    else:
        print(f"Body: {r.text}")
except Exception as e:
    print(f"Error: {e}")
