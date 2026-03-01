# backend/main.py
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import datetime
import os
from typing import List, Optional
import sounddevice as sd
import numpy as np
import queue
import threading
import asyncio
import edge_tts
import pygame
import tempfile
import time
import json
from faster_whisper import WhisperModel
import google.generativeai as genai

# =============================
# CONFIG
# =============================

MONGODB_URL = "mongodb+srv://Darsini:Muruga27@voice-agent.rfvpkvc.mongodb.net/?appName=voice-agent"
GEMINI_API_KEY = "AIzaSyA2ezQlB-3WJ5_Jhyyo3wXUOSsRVWpjmqM"

SAMPLE_RATE = 16000
FRAME_DURATION = 30
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION / 1000)

# =============================
# MongoDB Setup
# =============================

client = AsyncIOMotorClient(MONGODB_URL)
db = client.voice_agent
chats_collection = db.chats
messages_collection = db.messages

# =============================
# FastAPI App
# =============================

app = FastAPI()

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================
# Pydantic Models
# =============================

class MessageModel(BaseModel):
    text: str
    sender: str  # 'user' or 'agent'
    timestamp: datetime.datetime

class ChatModel(BaseModel):
    id: Optional[str] = None
    title: str
    messages: List[MessageModel] = []
    created_at: datetime.datetime
    updated_at: datetime.datetime

class CreateChatRequest(BaseModel):
    title: str = "New Conversation"

class AddMessageRequest(BaseModel):
    chat_id: str
    text: str
    sender: str

# =============================
# Gemini Setup
# =============================

genai.configure(api_key="AIzaSyA2ezQlB-3WJ5_Jhyyo3wXUOSsRVWpjmqM")
gemini_model = genai.GenerativeModel("models/gemini-2.5-flash")

# =============================
# Whisper Setup
# =============================

whisper_model = WhisperModel(
    "base.en",
    device="cuda",
    compute_type="float16"
)

# =============================
# Voice Processing
# =============================

audio_queue = queue.Queue()
text_queue = queue.Queue()
tts_queue = queue.Queue()
shutdown_event = threading.Event()
is_speaking = False
interrupt_event = threading.Event()

pygame.mixer.init()

def audio_callback(indata, frames, time_info, status):
    if status:
        return
    audio_queue.put(bytes(indata))

# Start audio stream
stream = sd.RawInputStream(
    samplerate=SAMPLE_RATE,
    blocksize=FRAME_SIZE,
    dtype="int16",
    channels=1,
    callback=audio_callback,
)
stream.start()

# =============================
# API Routes
# =============================

@app.get("/")
async def root():
    return {"message": "Voice Agent API"}

# Chat endpoints
@app.get("/api/chats", response_model=List[ChatModel])
async def get_chats():
    chats = await chats_collection.find().sort("updated_at", -1).to_list(100)
    for chat in chats:
        chat["id"] = str(chat["_id"])
        # Get messages for this chat
        messages = await messages_collection.find({"chat_id": str(chat["_id"])}).sort("timestamp", 1).to_list(100)
        chat["messages"] = [
            {
                "text": msg["text"],
                "sender": msg["sender"],
                "timestamp": msg["timestamp"]
            }
            for msg in messages
        ]
    return chats

@app.post("/api/chats", response_model=ChatModel)
async def create_chat(request: CreateChatRequest):
    chat = {
        "title": request.title,
        "created_at": datetime.datetime.now(),
        "updated_at": datetime.datetime.now()
    }
    result = await chats_collection.insert_one(chat)
    print(f"Inserted chat with ID: {result.inserted_id}")
    chat["_id"] = result.inserted_id
    chat["id"] = str(result.inserted_id)
    chat["messages"] = []
    print(f"Created chat with ID: {chat['id']}")
    return chat

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    await messages_collection.delete_many({"chat_id": chat_id})
    result = await chats_collection.delete_one({"_id": ObjectId(chat_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"message": "Chat deleted"}

@app.post("/api/messages")
async def add_message(request: AddMessageRequest):
    message = {
        "chat_id": request.chat_id,
        "text": request.text,
        "sender": request.sender,
        "timestamp": datetime.datetime.now()
    }
    print(f"Adding message to chat {request.chat_id}: {request.text} (sender: {request.sender})")
    result = await messages_collection.insert_one(message)
    
    # Update chat's updated_at
    await chats_collection.update_one(
        {"_id": ObjectId(request.chat_id)},
        {"$set": {"updated_at": datetime.datetime.now()}}
    )
    
    return {
        "id": str(result.inserted_id),
        "text": message["text"],
        "sender": message["sender"],
        "timestamp": message["timestamp"]
    }

# =============================
# WebSocket for Voice
# =============================

@app.websocket("/ws/voice")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connected")
    
    try:
        while True:
            # Receive audio data from frontend
            data = await websocket.receive_bytes()
            
            # Convert to numpy array
            audio_np = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Transcribe with Whisper
            segments, _ = whisper_model.transcribe(audio_np)
            text = "".join([seg.text for seg in segments]).strip()
            
            if not text:
                continue
            
            print(f"User said: {text}")
            
            # Send transcription back to frontend
            await websocket.send_json({
                "type": "transcript",
                "text": text
            })
            
            # Get Gemini response
            response = gemini_model.generate_content(text)
            ai_text = response.text
            
            print(f"AI: {ai_text}")
            
            # Send AI response
            await websocket.send_json({
                "type": "response",
                "text": ai_text
            })
            
            # Generate TTS
            communicate = edge_tts.Communicate(ai_text, "en-US-JennyNeural")
            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
            
            # Send audio back
            await websocket.send_bytes(audio_data)
            
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        print("WebSocket disconnected")

# =============================
# Start Server
# =============================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)