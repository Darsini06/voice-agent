import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import datetime

MONGODB_URL = "mongodb+srv://Darsini:Muruga27@voice-agent.rfvpkvc.mongodb.net/?appName=voice-agent"

async def seed():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client.voice_agent

    chat = {
        "title": "Demo Voice Conversation",
        "created_at": datetime.datetime.now(),
        "updated_at": datetime.datetime.now()
    }

    result = await db.chats.insert_one(chat)
    chat_id = str(result.inserted_id)

    messages = [
        {
            "chat_id": chat_id,
            "text": "Hello! How can I help you today?",
            "sender": "agent",
            "timestamp": datetime.datetime.now()
        },
        {
            "chat_id": chat_id,
            "text": "Can you explain how voice AI works?",
            "sender": "user",
            "timestamp": datetime.datetime.now()
        },
        {
            "chat_id": chat_id,
            "text": "Sure! Voice AI uses speech recognition and AI models.",
            "sender": "agent",
            "timestamp": datetime.datetime.now()
        }
    ]

    await db.messages.insert_many(messages)
    print("Dummy data inserted!")

asyncio.run(seed())