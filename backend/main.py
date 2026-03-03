from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import traceback
import datetime
import asyncio
import threading
import queue
import json
import time
import os
from pydub import AudioSegment
import io
import tempfile
from typing import List, Optional, Dict

import numpy as np
import webrtcvad
import edge_tts
import pygame
from faster_whisper import WhisperModel
import google.generativeai as genai

# =============================
# CONFIG
# =============================

MONGODB_URL = "mongodb+srv://Darsini:Muruga27@voice-agent.rfvpkvc.mongodb.net/?appName=voice-agent"
GEMINI_API_KEY = "AIzaSyBuycqWwCSJcZ08SSme3hGR3pF7xuqdIEY"  

SAMPLE_RATE = 16000
FRAME_DURATION = 30
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION / 1000)
SILENCE_LIMIT = 20
MIN_SPEECH_FRAMES = 25

VOICE = "en-US-JennyNeural"

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
# Pydantic Models (unchanged)
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
# Gemini Setup
# =============================

genai.configure(api_key=GEMINI_API_KEY)
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
# Voice Session (unchanged from previous answer)
# =============================

# class VoiceSession:
#     def __init__(self, websocket: WebSocket, chat_id: str, chat_history: List[Dict]):
#         self.websocket = websocket
#         self.chat_id = chat_id
#         self.chat_session = gemini_model.start_chat(history=chat_history)

#         self.audio_queue = queue.Queue()
#         self.text_queue = queue.Queue()
#         self.tts_queue = queue.Queue()
#         self.outgoing_queue = queue.Queue()

#         self.shutdown_event = threading.Event()
#         self.interrupt_event = threading.Event()
#         self.is_speaking = False

#         self.vad = webrtcvad.Vad(3)

#         self.audio_thread = None
#         self.text_thread = None
#         self.tts_thread = None

#         self.temp_files = []

#     def start(self):
#         self.audio_thread = threading.Thread(target=self._audio_processor, daemon=True)
#         self.text_thread = threading.Thread(target=self._text_worker, daemon=True)
#         self.tts_thread = threading.Thread(target=self._tts_worker, daemon=True)

#         self.audio_thread.start()
#         self.text_thread.start()
#         self.tts_thread.start()

#     def stop(self):
#         self.shutdown_event.set()

#         if self.audio_thread:
#             self.audio_thread.join(timeout=2)
#         if self.text_thread:
#             self.text_thread.join(timeout=2)
#         if self.tts_thread:
#             self.tts_thread.join(timeout=2)

#         for f in self.temp_files:
#             try:
#                 os.remove(f)
#             except:
#                 pass

#     def _audio_processor(self):
#         voiced_frames = []
#         silence_counter = 0

#         while not self.shutdown_event.is_set():
#             try:
#                 frame = self.audio_queue.get(timeout=0.1)
#             except queue.Empty:
#                 continue

#             try:
#                 is_speech = self.vad.is_speech(frame, SAMPLE_RATE)
#             except Exception as e:
#                 print(f"❌ VAD error: {e}")
#                 continue

#             try:
#                 if is_speech:
#                     voiced_frames.append(frame)
#                     silence_counter = 0
#                 else:
#                     silence_counter += 1

#                 if silence_counter > SILENCE_LIMIT and voiced_frames:
#                     if len(voiced_frames) < MIN_SPEECH_FRAMES:
#                         voiced_frames = []
#                         silence_counter = 0
#                         continue

#                     audio_data = b''.join(voiced_frames)
#                     voiced_frames = []
#                     silence_counter = 0

#                     audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
#                     segments, _ = whisper_model.transcribe(audio_np)
#                     text = "".join([seg.text for seg in segments]).strip().lower()

#                     if not text or len(text.split()) < 2:
#                         continue

#                     if "stop" in text:
#                         self.interrupt_event.set()
#                         continue

#                     self.outgoing_queue.put({
#                         "type": "json",
#                         "data": {"type": "transcript", "text": text}
#                     })

#                     threading.Thread(
#                         target=self._add_message_to_db,
#                         args=(text, "user"),
#                         daemon=True
#                     ).start()

#                     self.text_queue.put(text)
#             except Exception as e:
#                 print(f"❌ Error in _audio_processor: {e}")
#                 import traceback
#                 traceback.print_exc()

#     def _text_worker(self):
#         while not self.shutdown_event.is_set():
#             try:
#                 text = self.text_queue.get(timeout=0.1)
#             except queue.Empty:
#                 continue

#             try:
#                 if text:
#                     self._process_user_text(text)
#             except Exception as e:
#                 print(f"❌ Error in _text_worker: {e}")
#                 traceback.print_exc()

#     def _tts_worker(self):
#         loop = asyncio.new_event_loop()
#         asyncio.set_event_loop(loop)

#         while not self.shutdown_event.is_set():
#             try:
#                 text = self.tts_queue.get(timeout=0.1)
#             except queue.Empty:
#                 continue

#             if not text.strip():
#                 continue

#             self.interrupt_event.clear()
#             self.is_speaking = True

#             try:
#                 with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as f:
#                     filename = f.name
#                 self.temp_files.append(filename)

#                 loop.run_until_complete(self._generate_audio(text, filename))

#                 with open(filename, "rb") as af:
#                     audio_data = af.read()

#                 self.outgoing_queue.put({
#                     "type": "bytes",
#                     "data": audio_data
#                 })
#             except Exception as e:
#                 print(f"❌ TTS error: {e}")
#                 traceback.print_exc()
#             finally:
#                 self.is_speaking = False

#     async def _generate_audio(self, text: str, filename: str):
#         communicate = edge_tts.Communicate(text, VOICE)
#         await communicate.save(filename)

#     def _process_user_text(self, user_text: str):
#         if self.interrupt_event.is_set():
#             return

#         try:
#             response = self.chat_session.send_message(user_text, stream=True)

#             full_reply = ""
#             for chunk in response:
#                 if self.interrupt_event.is_set():
#                     return
#                 if chunk.text:
#                     full_reply += chunk.text

#             if full_reply:
#                 self.outgoing_queue.put({
#                     "type": "json",
#                     "data": {"type": "response", "text": full_reply}
#                 })

#                 threading.Thread(
#                     target=self._add_message_to_db,
#                     args=(full_reply, "agent"),
#                     daemon=True
#                 ).start()

#                 self.tts_queue.put(full_reply)
#         except Exception as e:
#             print(f"❌ Gemini error: {e}")
#             traceback.print_exc()

# =============================
# VoiceSession Class (Fixed)
# =============================

# =============================
# VoiceSession Class
# =============================

class VoiceSession:
    def __init__(self, websocket: WebSocket, chat_id: str, chat_history: List[Dict]):
        self.websocket = websocket
        self.chat_id = chat_id
        self.chat_session = gemini_model.start_chat(history=chat_history)

        self.audio_queue = queue.Queue()
        self.text_queue = queue.Queue()
        self.tts_queue = queue.Queue()
        self.outgoing_queue = queue.Queue()

        self.shutdown_event = threading.Event()
        self.interrupt_event = threading.Event()
        self.is_speaking = False

        self.vad = webrtcvad.Vad(3)

        self.audio_thread = None
        self.text_thread = None
        self.tts_thread = None

        self.temp_files = []

        # Event loop for async DB calls
        try:
            self.loop = asyncio.get_running_loop()
        except RuntimeError:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)

    # -------------------------
    # Start/Stop threads
    # -------------------------
    def start(self):
        self.audio_thread = threading.Thread(target=self._audio_processor, daemon=True)
        self.text_thread = threading.Thread(target=self._text_worker, daemon=True)
        self.tts_thread = threading.Thread(target=self._tts_worker, daemon=True)

        self.audio_thread.start()
        self.text_thread.start()
        self.tts_thread.start()

    def stop(self):
        self.shutdown_event.set()
        if self.audio_thread:
            self.audio_thread.join(timeout=2)
        if self.text_thread:
            self.text_thread.join(timeout=2)
        if self.tts_thread:
            self.tts_thread.join(timeout=2)

        for f in self.temp_files:
            try:
                os.remove(f)
            except:
                pass

    # -------------------------
    # Audio processor (VAD + Whisper)
    # -------------------------
    def _audio_processor(self):
        voiced_frames = []
        silence_counter = 0

        while not self.shutdown_event.is_set():
            try:
                frame = self.audio_queue.get(timeout=0.1)
            except queue.Empty:
                continue

            try:
                is_speech = self.vad.is_speech(frame, SAMPLE_RATE)
            except Exception as e:
                print(f"❌ VAD error: {e}")
                continue

            if is_speech:
                voiced_frames.append(frame)
                silence_counter = 0
            else:
                silence_counter += 1

            if silence_counter > SILENCE_LIMIT and voiced_frames:
                if len(voiced_frames) < MIN_SPEECH_FRAMES:
                    voiced_frames = []
                    silence_counter = 0
                    continue

                audio_data = b''.join(voiced_frames)
                voiced_frames = []
                silence_counter = 0

                # Convert to float32
                audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
                segments, _ = whisper_model.transcribe(audio_np)
                text = "".join([seg.text for seg in segments]).strip().lower()

                if not text or len(text.split()) < 2:
                    continue

                if "stop" in text:
                    self.interrupt_event.set()
                    continue

                self.outgoing_queue.put({"type": "json", "data": {"type": "transcript", "text": text}})

                # Save user message
                asyncio.run_coroutine_threadsafe(self._add_message_async(text, "user"), self.loop)

                self.text_queue.put(text)

    def _text_worker(self):
     while not self.shutdown_event.is_set():
        try:
            user_text = self.text_queue.get(timeout=0.1)
        except queue.Empty:
            continue

        if not user_text:
            continue

        try:
            print("📝 User said:", user_text)
            response = self.chat_session.send_message(user_text, stream=True)

            full_reply = ""

            for chunk in response:
                if self.interrupt_event.is_set():
                    break

                if chunk.text:
                    full_reply += chunk.text

            if full_reply.strip():
                print("🤖 AI Reply:", full_reply)

                self.outgoing_queue.put({
                    "type": "json",
                    "data": {"type": "response", "text": full_reply}
                })

                asyncio.run_coroutine_threadsafe(
                    self._add_message_async(full_reply, "agent"),
                    self.loop
                )

                self.tts_queue.put(full_reply)

        except Exception as e:
            print("❌ Gemini error:", e)
            traceback.print_exc()
    # -------------------------
    # TTS worker (edge-tts)
    # -------------------------
    def _tts_worker(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        while not self.shutdown_event.is_set():
            try:
                text = self.tts_queue.get(timeout=0.1)
            except queue.Empty:
                continue

            if not text.strip():
                continue

            self.interrupt_event.clear()
            self.is_speaking = True

            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as f:
                    filename = f.name
                self.temp_files.append(filename)

                loop.run_until_complete(self._generate_audio(text, filename))

                with open(filename, "rb") as af:
                    audio_data = af.read()

                self.outgoing_queue.put({"type": "bytes", "data": audio_data})

            except Exception as e:
                print(f"❌ TTS error: {e}")
                traceback.print_exc()
            finally:
                self.is_speaking = False

    async def _generate_audio(self, text: str, filename: str):
        communicate = edge_tts.Communicate(text, VOICE)
        await communicate.save(filename)

    # -------------------------
    # Async DB save
    # -------------------------
    async def _add_message_async(self, text: str, sender: str):
        try:
            message = {
                "chat_id": self.chat_id,
                "text": text,
                "sender": sender,
                "timestamp": datetime.datetime.now(datetime.timezone.utc)
            }
            await messages_collection.insert_one(message)
            await chats_collection.update_one(
                {"_id": ObjectId(self.chat_id)},
                {"$set": {"updated_at": datetime.datetime.now(datetime.timezone.utc)}}
            )
            print(f"✅ Message saved and chat updated: {text[:30]}...")
        except Exception:
            print("❌ Error saving message or updating chat:")
            traceback.print_exc()

# REST endpoints (unchanged)
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
# WebSocket for Voice (updated to handle init)
# =============================

# @app.websocket("/ws/voice")
# async def websocket_endpoint(websocket: WebSocket):
#     await websocket.accept()
#     print("WebSocket connected")

#     session = None
#     send_task = None
#     chat_id = None

#     try:
#         # 1. Wait for init message (with timeout)
#         init_msg = await asyncio.wait_for(websocket.receive_text(), timeout=10)
#         init = json.loads(init_msg)
#         if init.get("type") != "init" or "chatId" not in init:
#             print("❌ Invalid init message")
#             await websocket.close(code=1003, reason="Missing or invalid init message")
#             return

#         chat_id = init["chatId"]
#         print(f"✅ Initialized for chat {chat_id}")

#         # 2. Load chat and history
#         try:
#             chat = await chats_collection.find_one({"_id": ObjectId(chat_id)})
#             if not chat:
#                 print(f"❌ Chat {chat_id} not found")
#                 await websocket.close(code=1003, reason="Chat not found")
#                 return
#         except Exception as e:
#             print(f"❌ Error loading chat: {e}")
#             await websocket.close(code=1011, reason="Database error")
#             return

#         try:
#             messages = await messages_collection.find({"chat_id": chat_id}).sort("timestamp", 1).to_list(100)
#             history = []
#             for msg in messages:
#                 role = "user" if msg["sender"] == "user" else "model"
#                 history.append({"role": role, "parts": [msg["text"]]})
#             print(f"📜 Loaded {len(history)} history messages")
#         except Exception as e:
#             print(f"❌ Error loading messages: {e}")
#             await websocket.close(code=1011, reason="Database error")
#             return

#         # 3. Create session
#         try:
#             session = VoiceSession(websocket, chat_id, history)
#             session.start()
#             print("✅ VoiceSession started")
#         except Exception as e:
#             print(f"❌ Error creating VoiceSession: {e}")
#             import traceback
#             traceback.print_exc()
#             await websocket.close(code=1011, reason="Session creation failed")
#             return

#         # 4. Start background sender
#         async def send_loop():
#             try:
#                 while True:
#                     try:
#                         item = session.outgoing_queue.get(timeout=0.1)
#                     except queue.Empty:
#                         await asyncio.sleep(0.05)
#                         continue

#                     if item["type"] == "json":
#                         await websocket.send_json(item["data"])
#                     elif item["type"] == "bytes":
#                         await websocket.send_bytes(item["data"])
#             except asyncio.CancelledError:
#                 pass
#             except Exception as e:
#                 print(f"❌ Error in send_loop: {e}")

#         send_task = asyncio.create_task(send_loop())

#         # 5. Main receive loop
#         while True:
#             try:
#                 message = await websocket.receive()
#                 if "bytes" in message:
#                     session.audio_queue.put(message["bytes"])
#                 elif "text" in message:
#                     data = json.loads(message["text"])
#                     if data.get("type") == "command" and data.get("command") == "stop":
#                         session.interrupt_event.set()
#             except WebSocketDisconnect:
#                 print("WebSocket disconnected (client closed)")
#                 break
#             except Exception as e:
#                 print(f"❌ Error in receive loop: {e}")
#                 import traceback
#                 traceback.print_exc()
#                 break

#     except asyncio.TimeoutError:
#         print("Init message timeout")
#         await websocket.close(code=1003, reason="Init message timeout")
#     except WebSocketDisconnect:
#         print("WebSocket disconnected (before init)")
#     except Exception as e:
#         print(f"❌ Unhandled exception in websocket_endpoint: {e}")
#         import traceback
#         traceback.print_exc()
#     finally:
#         if send_task:
#             send_task.cancel()
#         if session:
#             session.stop()
#         print("WebSocket cleaned up")
@app.websocket("/ws/voice")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connected")

    session = None
    send_task = None

    try:
        # -------------------------
        # 1. Wait for init
        # -------------------------
        try:
            init_msg = await asyncio.wait_for(
                websocket.receive_text(),
                timeout=10
            )
            init = json.loads(init_msg)

            if init.get("type") != "init" or "chatId" not in init:
                await websocket.close(code=1003, reason="Invalid init")
                return

            chat_id = init["chatId"]
            print(f"Initialized: {chat_id}")

        except asyncio.TimeoutError:
            await websocket.close(code=1003, reason="Init timeout")
            return

        except Exception:
            await websocket.close(code=1003, reason="Bad init")
            return

        # -------------------------
        # 2. Load chat history
        # -------------------------
        chat = await chats_collection.find_one({"_id": ObjectId(chat_id)})

        if not chat:
            await websocket.close(code=1003, reason="Chat not found")
            return

        messages = await messages_collection.find(
            {"chat_id": chat_id}
        ).sort("timestamp", 1).to_list(100)

        history = [
            {
                "role": "user" if m["sender"] == "user" else "model",
                "parts": [m["text"]],
            }
            for m in messages
        ]

        # -------------------------
        # 3. Start session
        # -------------------------
        session = VoiceSession(websocket, chat_id, history)
        session.start()

        print("VoiceSession started")

        # -------------------------
        # 4. Sender task
        # -------------------------
        async def send_loop():
            try:
                while not session.shutdown_event.is_set():
                    try:
                        item = session.outgoing_queue.get(timeout=0.1)
                    except queue.Empty:
                        await asyncio.sleep(0.05)
                        continue

                    if item["type"] == "json":
                        await websocket.send_json(item["data"])

                    elif item["type"] == "bytes":
                        await websocket.send_bytes(item["data"])

            except asyncio.CancelledError:
                pass

            except Exception as e:
                print("Send error:", e)

        send_task = asyncio.create_task(send_loop())

        # -------------------------
        # 5. Receive loop (SAFE)
        # -------------------------
        while True:
            try:
                msg = await websocket.receive()

                # Client disconnected
                if msg["type"] == "websocket.disconnect":
                    print("Client disconnected")
                    break

                # Audio
                if "bytes" in msg:
                    session.audio_queue.put(msg["bytes"])

                # Commands
                elif "text" in msg:
                    data = json.loads(msg["text"])

                    if data.get("type") == "command":
                        if data.get("command") == "stop":
                            session.interrupt_event.set()

            except WebSocketDisconnect:
                print("WebSocket disconnected")
                break

            except Exception as e:
                print("Receive error:", e)
                break

    finally:
        if send_task and not send_task.done():
            send_task.cancel()

        if session:
            session.stop()

        print("WebSocket cleaned up")
# =============================
# Start Server
# =============================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)