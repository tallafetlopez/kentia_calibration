from pymongo import MongoClient
client = MongoClient('mongodb://localhost:27017')
db = client['calibration_db']
users = list(db['users'].find({}, {'email': 1, 'name': 1, 'password_hash': 1, '_id': 0}))
print(f"\n✓ Total de usuarios: {len(users)}\n")
for u in users:
    print(f"  - {u['email']}: {u['name']}")
print(f"\nContraseña demo: password123")
