import os
from datetime import datetime, timezone
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
now = datetime.now(timezone.utc)

roles = [
    {
        "name": "viewer",
        "permissions": [
            "read_record",
            "view_summary"
        ],
        "createdAt": now,
        "updatedAt": now
    },
    {
        "name": "analyst",
        "permissions": [
            "read_record",
            "view_summary",
            "view_trends",
            "view_category_breakdown"
        ],
        "createdAt": now,
        "updatedAt": now
    },
    {
        "name": "admin",
        "permissions": [
            "manage_users",
            "create_record",
            "read_record",
            "update_record",
            "delete_record",
            "view_summary",
            "view_trends",
            "view_category_breakdown"
        ],
        "createdAt": now,
        "updatedAt": now
    }
]

def seed_roles():
    client = None
    try:
        # Connect
        client = MongoClient(MONGODB_URI)
        db = client.get_default_database()
        collection = db["roles"]

        print("Connected to MongoDB")

        # Clearing existing roles to avoid duplicates
        collection.delete_many({})

        result = collection.insert_many(roles)
        print(f"✅ Seeded {len(result.inserted_ids)} roles successfully!")

    except PyMongoError as e:
        print(f"❌ Error seeding roles: {e}")
        raise SystemExit(1)

    finally:
        if client:
            client.close()
            print("Disconnected from MongoDB")


if __name__ == "__main__":
    seed_roles()