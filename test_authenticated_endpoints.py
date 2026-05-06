import requests
import json

BASE_URL = "http://localhost:8000"

def test_authenticated_endpoints():
    """Test login and authenticated endpoints"""
    
    # 1. Test login
    print("[*] Testing login endpoint...")
    login_data = {
        "email": "admin@herko.dev",
        "password": "password123"
    }
    
    try:
        resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json=login_data
        )
        if resp.status_code == 200:
            login_result = resp.json()
            token = login_result.get("token")
            print(f"[+] Login successful!")
            print(f"    Token: {token[:20]}...")
        else:
            print(f"[-] Login failed with status {resp.status_code}")
            print(f"    Error: {resp.text}")
            return
    except Exception as e:
        print(f"[-] Login error: {e}")
        return
    
    # 2. Test /auth/me endpoint
    print("\n[*] Testing /auth/me endpoint...")
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=headers
        )
        if resp.status_code == 200:
            user = resp.json()
            print(f"[+] /auth/me successful!")
            print(f"    User: {json.dumps(user, indent=2)}")
        else:
            print(f"[-] /auth/me failed with status {resp.status_code}")
            print(f"    Error: {resp.text}")
    except Exception as e:
        print(f"[-] /auth/me error: {e}")
    
    # 3. Test /api/ecus endpoint
    print("\n[*] Testing /api/ecus endpoint...")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/software-releases",
            headers=headers
        )
        if resp.status_code == 200:
            ecus = resp.json()
            print(f"[+] /api/ecus successful!")
            print(f"    ECUs found: {len(ecus)}")
            if ecus:
                print(f"    First ECU: {json.dumps(ecus[0], indent=2)}")
        else:
            print(f"[-] /api/ecus failed with status {resp.status_code}")
            print(f"    Error: {resp.text}")
    except Exception as e:
        print(f"[-] /api/ecus error: {e}")
    
    # 4. Test /api/users endpoint
    print("\n[*] Testing /api/users endpoint...")
    try:
        resp = requests.get(
            f"{BASE_URL}/api/users",
            headers=headers
        )
        if resp.status_code == 200:
            releases = resp.json()
            print(f"[+] /api/software-releases successful!")
            print(f"    Releases found: {len(releases)}")
            if releases:
                print(f"    First release: {json.dumps(releases[0], indent=2)}")
        else:
            print(f"[-] /api/software-releases failed with status {resp.status_code}")
            print(f"    Error: {resp.text}")
    except Exception as e:
        print(f"[-] /api/software-releases error: {e}")

if __name__ == "__main__":
    test_authenticated_endpoints()
