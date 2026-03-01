# # backend/main.py
# from fastapi import FastAPI, WebSocket, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from pydantic import BaseModel
# from motor.motor_asyncio import AsyncIOMotorClient
# from bson import ObjectId
# import datetime
# import os
# from typing import List, Optional
# import sounddevice as sd
# import numpy as np
# import queue
# import threading
# import asyncio
# import edge_tts
# import pygame
# import tempfile
# import time
# import json
# from faster_whisper import WhisperModel
# import google.generativeai as genai

# # =============================
# # CONFIG
# # =============================

# MONGODB_URL = "mongodb+srv://Darsini:Muruga27@voice-agent.rfvpkvc.mongodb.net/?appName=voice-agent"
# GEMINI_API_KEY = "AIzaSyA2ezQlB-3WJ5_Jhyyo3wXUOSsRVWpjmqM"

# SAMPLE_RATE = 16000
# FRAME_DURATION = 30
# FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION / 1000)

# # =============================
# # MongoDB Setup
# # =============================

# client = AsyncIOMotorClient(MONGODB_URL)
# db = client.voice_agent
# chats_collection = db.chats
# messages_collection = db.messages

# # =============================
# # FastAPI App
# # =============================

# app = FastAPI()

# # CORS for React frontend
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:5173"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # =============================
# # Pydantic Models
# # =============================

# class MessageModel(BaseModel):
#     text: str
#     sender: str  # 'user' or 'agent'
#     timestamp: datetime.datetime

# class ChatModel(BaseModel):
#     id: Optional[str] = None
#     title: str
#     messages: List[MessageModel] = []
#     created_at: datetime.datetime
#     updated_at: datetime.datetime

# class CreateChatRequest(BaseModel):
#     title: str = "New Conversation"

# class AddMessageRequest(BaseModel):
#     chat_id: str
#     text: str
#     sender: str

# # =============================
# # Gemini Setup
# # =============================

# genai.configure(api_key="AIzaSyA2ezQlB-3WJ5_Jhyyo3wXUOSsRVWpjmqM")
# gemini_model = genai.GenerativeModel("models/gemini-2.5-flash")

# # =============================
# # Whisper Setup
# # =============================

# whisper_model = WhisperModel(
#     "base.en",
#     device="cuda",
#     compute_type="float16"
# )

# # =============================
# # Voice Processing
# # =============================

# audio_queue = queue.Queue()
# text_queue = queue.Queue()
# tts_queue = queue.Queue()
# shutdown_event = threading.Event()
# is_speaking = False
# interrupt_event = threading.Event()

# pygame.mixer.init()

# def audio_callback(indata, frames, time_info, status):
#     if status:
#         return
#     audio_queue.put(bytes(indata))

# # Start audio stream
# stream = sd.RawInputStream(
#     samplerate=SAMPLE_RATE,
#     blocksize=FRAME_SIZE,
#     dtype="int16",
#     channels=1,
#     callback=audio_callback,
# )
# stream.start()

# # =============================
# # API Routes
# # =============================

# @app.get("/")
# async def root():
#     return {"message": "Voice Agent API"}

# # Chat endpoints
# @app.get("/api/chats", response_model=List[ChatModel])
# async def get_chats():
#     chats = await chats_collection.find().sort("updated_at", -1).to_list(100)
#     for chat in chats:
#         chat["id"] = str(chat["_id"])
#         # Get messages for this chat
#         messages = await messages_collection.find({"chat_id": str(chat["_id"])}).sort("timestamp", 1).to_list(100)
#         chat["messages"] = [
#             {
#                 "text": msg["text"],
#                 "sender": msg["sender"],
#                 "timestamp": msg["timestamp"]
#             }
#             for msg in messages
#         ]
#     return chats

# @app.post("/api/chats", response_model=ChatModel)
# async def create_chat(request: CreateChatRequest):
#     chat = {
#         "title": request.title,
#         "created_at": datetime.datetime.now(),
#         "updated_at": datetime.datetime.now()
#     }
#     result = await chats_collection.insert_one(chat)
#     print(f"Inserted chat with ID: {result.inserted_id}")
#     chat["_id"] = result.inserted_id
#     chat["id"] = str(result.inserted_id)
#     chat["messages"] = []
#     print(f"Created chat with ID: {chat['id']}")
#     return chat

# @app.delete("/api/chats/{chat_id}")
# async def delete_chat(chat_id: str):
#     await messages_collection.delete_many({"chat_id": chat_id})
#     result = await chats_collection.delete_one({"_id": ObjectId(chat_id)})
#     if result.deleted_count == 0:
#         raise HTTPException(status_code=404, detail="Chat not found")
#     return {"message": "Chat deleted"}

# @app.post("/api/messages")
# async def add_message(request: AddMessageRequest):
#     message = {
#         "chat_id": request.chat_id,
#         "text": request.text,
#         "sender": request.sender,
#         "timestamp": datetime.datetime.now()
#     }
#     print(f"Adding message to chat {request.chat_id}: {request.text} (sender: {request.sender})")
#     result = await messages_collection.insert_one(message)
    
#     # Update chat's updated_at
#     await chats_collection.update_one(
#         {"_id": ObjectId(request.chat_id)},
#         {"$set": {"updated_at": datetime.datetime.now()}}
#     )
    
#     return {
#         "id": str(result.inserted_id),
#         "text": message["text"],
#         "sender": message["sender"],
#         "timestamp": message["timestamp"]
#     }

# # =============================
# # WebSocket for Voice
# # =============================

# @app.websocket("/ws/voice")
# async def websocket_endpoint(websocket: WebSocket):
#     await websocket.accept()
#     print("WebSocket connected")
    
#     try:
#         while True:
#             # Receive audio data from frontend
#             data = await websocket.receive_bytes()
            
#             # Convert to numpy array
#             audio_np = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            
#             # Transcribe with Whisper
#             segments, _ = whisper_model.transcribe(audio_np)
#             text = "".join([seg.text for seg in segments]).strip()
            
#             if not text:
#                 continue
            
#             print(f"User said: {text}")
            
#             # Send transcription back to frontend
#             await websocket.send_json({
#                 "type": "transcript",
#                 "text": text
#             })
            
#             # Get Gemini response
#             response = gemini_model.generate_content(text)
#             ai_text = response.text
            
#             print(f"AI: {ai_text}")
            
#             # Send AI response
#             await websocket.send_json({
#                 "type": "response",
#                 "text": ai_text
#             })
            
#             # Generate TTS
#             communicate = edge_tts.Communicate(ai_text, "en-US-JennyNeural")
#             audio_data = b""
#             async for chunk in communicate.stream():
#                 if chunk["type"] == "audio":
#                     audio_data += chunk["data"]
            
#             # Send audio back
#             await websocket.send_bytes(audio_data)
            
#     except Exception as e:
#         print(f"WebSocket error: {e}")
#     finally:
#         print("WebSocket disconnected")

# # =============================
# # Start Server
# # =============================

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(app, host="0.0.0.0", port=8000)

# backend/main.py
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import datetime
from typing import List, Optional
import sounddevice as sd
import numpy as np
import queue
import threading
import asyncio
import edge_tts
import pygame
import tempfile
import os
import time
import sys
import json
import webrtcvad
from faster_whisper import WhisperModel
import google.generativeai as genai

# =============================
# CONFIG
# =============================

MONGODB_URL = "mongodb+srv://Darsini:Mu@voice-agent.rfvpkvc.mongodb.net/?appName=voice-agent"
GEMINI_API_KEY = ""  # <-- Add your Gemini API key here

SAMPLE_RATE = 16000
FRAME_DURATION = 30  # ms
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================
# Pydantic Models (keep as before)
# =============================

class MessageModel(BaseModel):
    text: str
    sender: str
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
# Gemini & Whisper Setup
# =============================

genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel("models/gemini-2.5-flash")

whisper_model = WhisperModel(
    "base.en",
    device="cuda",          # or "cpu" if no GPU
    compute_type="float16"
)

VOICE = "en-US-JennyNeural"

# =============================
# API Routes (unchanged)
# =============================

@app.get("/")
async def root():
    return {"message": "Voice Agent API"}

@app.get("/api/chats", response_model=List[ChatModel])
async def get_chats():
    chats = await chats_collection.find().sort("updated_at", -1).to_list(100)
    for chat in chats:
        chat["id"] = str(chat["_id"])
        messages = await messages_collection.find({"chat_id": str(chat["_id"])}).sort("timestamp", 1).to_list(100)
        chat["messages"] = [
            {"text": msg["text"], "sender": msg["sender"], "timestamp": msg["timestamp"]}
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
    chat["_id"] = result.inserted_id
    chat["id"] = str(result.inserted_id)
    chat["messages"] = []
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
    result = await messages_collection.insert_one(message)
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
# WebSocket Voice Handler (merged advanced logic)
# =============================

class VoiceSession:
    """Per‑connection session holding all voice processing state."""
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.chat_session = gemini_model.start_chat(history=[])
        self.audio_queue = asyncio.Queue()
        self.text_queue = asyncio.Queue()
        self.tts_queue = asyncio.Queue()
        self.shutdown_event = asyncio.Event()
        self.interrupt_event = asyncio.Event()
        self.is_speaking = False
        self.vad = webrtcvad.Vad(3)
        self.voiced_frames = []
        self.silence_counter = 0
        self.SILENCE_LIMIT = 20  # frames of silence before sending for transcription

        # Background tasks
        self.audio_processor_task = None
        self.tts_worker_task = None

    async def audio_processor(self):
        """Consume raw audio chunks, apply VAD, and when a speech segment ends,
        transcribe and put text into text_queue."""
        while not self.shutdown_event.is_set():
            try:
                frame = await asyncio.wait_for(self.audio_queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue

            # VAD processing (same as standalone)
            if self.vad.is_speech(frame, SAMPLE_RATE):
                self.voiced_frames.append(frame)
                self.silence_counter = 0
            else:
                self.silence_counter += 1

            # End of speech detected
            if self.silence_counter > self.SILENCE_LIMIT and self.voiced_frames:
                if len(self.voiced_frames) < 25:  # too short, likely noise
                    self.voiced_frames = []
                    self.silence_counter = 0
                    continue

                audio_data = b''.join(self.voiced_frames)
                self.voiced_frames = []
                self.silence_counter = 0

                # Transcribe (blocking, run in thread)
                loop = asyncio.get_running_loop()
                text = await loop.run_in_executor(None, self._transcribe, audio_data)
                if text:
                    await self.text_queue.put(text)

    def _transcribe(self, audio_data: bytes) -> str:
        """Run Whisper transcription (blocking)."""
        audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        segments, _ = whisper_model.transcribe(audio_np)
        return "".join(seg.text for seg in segments).strip()

    async def tts_worker(self):
        """Consume text from tts_queue, generate speech, and send audio back."""
        while not self.shutdown_event.is_set():
            try:
                text = await asyncio.wait_for(self.tts_queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue

            if not text or len(text.strip()) < 2:
                continue

            self.interrupt_event.clear()
            self.is_speaking = True

            # Generate TTS audio using edge-tts (async)
            communicate = edge_tts.Communicate(text, VOICE)
            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
                    # Optional: send audio in chunks for streaming playback
                    # await self.websocket.send_bytes(chunk["data"])
            # Send complete audio
            await self.websocket.send_bytes(audio_data)
            self.is_speaking = False

    async def generate_reply(self, user_text: str) -> Optional[str]:
        """Stream Gemini reply, handling interrupts."""
        if self.interrupt_event.is_set():
            return None
        try:
            response = self.chat_session.send_message(user_text, stream=True)
            full_reply = ""
            async for chunk in response:
                if self.interrupt_event.is_set():
                    print("🛑 Gemini streaming interrupted")
                    return None
                if chunk.text:
                    full_reply += chunk.text
            return full_reply.strip()
        except Exception as e:
            print(f"⚠️ Gemini Error: {e}")
            return None

    async def handle_connection(self):
        """Main WebSocket handler for this session."""
        # Start background tasks
        self.audio_processor_task = asyncio.create_task(self.audio_processor())
        self.tts_worker_task = asyncio.create_task(self.tts_worker())

        try:
            while not self.shutdown_event.is_set():
                # Receive message from client (binary audio or text command)
                message = await self.websocket.receive()
                if message["type"] == "websocket.receive":
                    if "bytes" in message:
                        # Raw audio chunk
                        await self.audio_queue.put(message["bytes"])
                    elif "text" in message:
                        # Text command (e.g., "stop")
                        cmd = json.loads(message["text"])
                        if cmd.get("type") == "interrupt":
                            self.interrupt_event.set()
                            # Also stop any playing TTS (already handled in tts_worker)
                elif message["type"] == "websocket.disconnect":
                    break

                # Process any completed transcriptions
                while not self.text_queue.empty():
                    user_text = await self.text_queue.get()
                    # Send transcript to frontend
                    await self.websocket.send_json({"type": "transcript", "text": user_text})

                    # Stop command detection
                    if "stop" in user_text.lower():
                        self.interrupt_event.set()
                        continue

                    # Generate AI reply
                    self.interrupt_event.clear()
                    reply = await self.generate_reply(user_text)
                    if reply and not self.interrupt_event.is_set():
                        # Send response text
                        await self.websocket.send_json({"type": "response", "text": reply})
                        # Queue TTS
                        await self.tts_queue.put(reply)
        except Exception as e:
            print(f"WebSocket error: {e}")
        finally:
            self.shutdown_event.set()
            await self.audio_processor_task
            await self.tts_worker_task

@app.websocket("/ws/voice")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = VoiceSession(websocket)
    await session.handle_connection()

# =============================
# Start Server
# =============================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)