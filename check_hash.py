from pymongo import MongoClient
client = MongoClient('mongodb://localhost:27017')
db = client['calibration_db']
user = db['users'].find_one({"email": "admin@herko.dev"})
if user:
    print(f"Email: {user['email']}")
    print(f"Name: {user['name']}")
    print(f"Roles: {user['roles']}")
    print(f"Password hash type: {type(user['password_hash'])}")
    print(f"Password hash: {user['password_hash'][:50]}..." if len(str(user['password_hash'])) > 50 else f"Password hash: {user['password_hash']}")
    print(f"\nPassword hash is valid bcrypt: {user['password_hash'].startswith('$2b$') or user['password_hash'].startswith('$2a$') or user['password_hash'].startswith('$2y$')}")
else:
    print("User not found")
