import bcrypt
from pymongo import MongoClient

password = "password123"

client = MongoClient('mongodb://localhost:27017')
db = client['calibration_db']
user = db['users'].find_one({"email": "admin@herko.dev"})

if user:
    print(f"Full hash: {user['password_hash']}")
    print(f"Hash length: {len(user['password_hash'])}")
    
    result = bcrypt.checkpw(password.encode("utf-8"), user['password_hash'].encode("utf-8"))
    print(f"Password verification: {result}")
    
    if result:
        print("✓ Password is correct!")
    else:
        print("✗ Password is incorrect!")
