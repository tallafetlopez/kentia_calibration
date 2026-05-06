import sys
sys.path.insert(0, 'c:\\Trabajo\\kentia_calibration\\backend')

from pathlib import Path
from dotenv import load_dotenv
env_path = Path('c:\\Trabajo\\kentia_calibration\\backend\\.env')
load_dotenv(env_path)

from models import LoginBody

try:
    # Test Pydantic validation
    body = LoginBody(email="admin@herko.dev", password="password123")
    print(f"✓ LoginBody valid: email={body.email}, password_len={len(body.password)}")
except Exception as e:
    print(f"✗ LoginBody validation failed: {e}")
