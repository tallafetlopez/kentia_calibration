import bcrypt

password = "password123"
hashed = "$2b$12$z6bRQh5enfzmykD00zASceaT0zzK05s9Ndes0vPK3eg48hvjx7HBK"

result = bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
print(f"Password verification result: {result}")

# Also try with the DB hash directly
from pymongo import MongoClient
client = MongoClient('mongodb://localhost:27017')
db = client['calibration_db']
user = db['users'].find_one({"email": "admin@herko.dev"})

if user:
    result2 = bcrypt.checkpw(password.encode("utf-8"), user['password_hash'].encode("utf-8"))
    print(f"Verification with DB hash: {result2}")
