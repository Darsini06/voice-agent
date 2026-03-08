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
import re

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
GEMINI_API_KEY = "AIzaSyCz35SYaQN68yXoBcy9a7uWx9g4o5Of4hQ"

SAMPLE_RATE = 16000
FRAME_DURATION = 30
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION / 1000)

# How many consecutive silent frames before we consider speech done
SILENCE_LIMIT = 8

# Minimum speech frames to consider valid (avoids noise triggers)
MIN_SPEECH_FRAMES = 10

# Minimum frames to trigger an interrupt (avoids accidental interrupts)
MIN_INTERRUPT_FRAMES = 5

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
# Pydantic Models
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
    device="cpu",
    compute_type="int8"
)


def split_into_sentences(text: str) -> List[str]:
    """
    Split text into sentences for chunk-by-chunk TTS.
    This allows interrupt to work between sentences.
    """
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    result = []
    for s in sentences:
        s = s.strip()
        if s:
            result.append(s)
    return result if result else [text]


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

        # FIX: interrupt_event is now used correctly
        # Set when user speaks while AI is talking
        self.interrupt_event = threading.Event()

        # FIX: Tracks whether AI audio is currently being sent to client
        self.is_speaking = False

        # FIX: Tracks consecutive voiced frames during AI speech
        # Used to avoid noise false-interrupts
        self.interrupt_voiced_frames = 0

        self.vad = webrtcvad.Vad(1)

        self.audio_thread = None
        self.text_thread = None
        self.tts_thread = None

        self.temp_files = []

        # Grab the running FastAPI event loop
        try:
            self.loop = asyncio.get_running_loop()
        except RuntimeError:
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)

    # -------------------------
    # DB helpers
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

            if sender == "user":
                msg_count = await messages_collection.count_documents({"chat_id": self.chat_id})
                if msg_count == 1:
                    title = text[:40] + ("..." if len(text) > 40 else "")
                    await chats_collection.update_one(
                        {"_id": ObjectId(self.chat_id)},
                        {
                            "$set": {
                                "title": title,
                                "updated_at": datetime.datetime.now(datetime.timezone.utc)
                            }
                        }
                    )
                else:
                    await chats_collection.update_one(
                        {"_id": ObjectId(self.chat_id)},
                        {"$set": {"updated_at": datetime.datetime.now(datetime.timezone.utc)}}
                    )
            else:
                await chats_collection.update_one(
                    {"_id": ObjectId(self.chat_id)},
                    {"$set": {"updated_at": datetime.datetime.now(datetime.timezone.utc)}}
                )

            print(f"✅ Message saved: [{sender}] {text[:40]}...")

        except Exception:
            print("❌ Error saving message:")
            traceback.print_exc()

    async def _generate_audio(self, text: str, filename: str):
        communicate = edge_tts.Communicate(text, VOICE)
        await communicate.save(filename)

    # -------------------------
    # Start / Stop
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
            except Exception:
                pass

    # -------------------------
    # Audio Processor (VAD + Whisper)
    # -------------------------

    def _audio_processor(self):
        voiced_frames = []
        silence_counter = 0
        total_frames = 0
        speech_frames = 0

        print("🎙️ [audio_processor] started")

        while not self.shutdown_event.is_set():
            try:
                frame = self.audio_queue.get(timeout=0.1)
            except queue.Empty:
                continue

            total_frames += 1

            # Validate frame size
            if len(frame) != FRAME_SIZE * 2:
                print(f"❌ [audio_processor] Wrong frame size: {len(frame)}, expected {FRAME_SIZE * 2}")
                continue

            if total_frames % 200 == 0:
                print(f"📊 [audio_processor] frames={total_frames} speech={speech_frames} "
                      f"voiced_run={len(voiced_frames)} silence={silence_counter} "
                      f"is_speaking={self.is_speaking}")

            try:
                is_speech = self.vad.is_speech(frame, SAMPLE_RATE)
            except Exception as e:
                print(f"❌ [audio_processor] VAD error: {e}")
                continue

            if is_speech:
                voiced_frames.append(frame)
                speech_frames += 1
                silence_counter = 0

                # FIX: Only trigger interrupt if enough consecutive voiced frames
                # This avoids background noise causing false interrupts
                if self.is_speaking:
                    self.interrupt_voiced_frames += 1
                    if self.interrupt_voiced_frames >= MIN_INTERRUPT_FRAMES:
                        print("🛑 User interrupting AI — triggering interrupt")
                        self.interrupt_event.set()
                        # Tell frontend to stop playing audio immediately
                        self.outgoing_queue.put({
                            "type": "json",
                            "data": {"type": "stop_audio"}
                        })
                        self.interrupt_voiced_frames = 0
            else:
                silence_counter += 1
                # FIX: Reset interrupt frame counter on any silence
                # (previously only reset when not is_speaking — carried over incorrectly)
                self.interrupt_voiced_frames = 0

            # Enough silence after speech — process the utterance
            if silence_counter > SILENCE_LIMIT and voiced_frames:
                if len(voiced_frames) < MIN_SPEECH_FRAMES:
                    print(f"⚠️ Too short ({len(voiced_frames)} frames), ignoring")
                    voiced_frames = []
                    silence_counter = 0
                    continue

                audio_data = b''.join(voiced_frames)
                voiced_frames = []
                silence_counter = 0
                self.interrupt_voiced_frames = 0

                # Convert PCM int16 → float32 for Whisper
                audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

                print("🧠 Running Whisper...")
                try:
                    segments, _ = whisper_model.transcribe(
                        audio_np,
                        language="en",
                        task="transcribe"
                    )
                    text = "".join([seg.text for seg in segments]).strip().lower()
                except Exception as e:
                    print(f"❌ Whisper error: {e}")
                    continue

                print(f"🧠 Transcribed: '{text}'")

                if not text:
                    continue

                # "stop" command — interrupt AI immediately
                if "stop" in text:
                    self.interrupt_event.set()
                    self.outgoing_queue.put({
                        "type": "json",
                        "data": {"type": "stop_audio"}
                    })
                    continue

                # Send transcript to frontend
                self.outgoing_queue.put({
                    "type": "json",
                    "data": {"type": "transcript", "text": text}
                })

                # Save user message to DB
                asyncio.run_coroutine_threadsafe(
                    self._add_message_async(text, "user"),
                    self.loop
                )

                # Push to Gemini worker
                self.text_queue.put(text)

    # -------------------------
    # Text Worker (Gemini)
    # -------------------------

    def _text_worker(self):
        print("📝 [text_worker] started")
        while not self.shutdown_event.is_set():
            try:
                user_text = self.text_queue.get(timeout=0.1)
            except queue.Empty:
                continue

            if not user_text:
                continue

            # Clear interrupt before starting new Gemini response
            self.interrupt_event.clear()
            print(f"📝 [text_worker] cleared interrupt, starting Gemini for: '{user_text[:60]}'")

            try:
                print(f"📝 User said: {user_text}")

                response = self.chat_session.send_message(user_text, stream=True)

                full_reply = ""

                for chunk in response:
                    # FIX: Check interrupt mid-stream and stop early
                    if self.interrupt_event.is_set():
                        print("🛑 Gemini stream interrupted by user")
                        break

                    if chunk.text:
                        full_reply += chunk.text

                # FIX: Always resolve stream to avoid resource leaks
                try:
                    response.resolve()
                except Exception:
                    pass  # Ignore errors on interrupted streams

                if full_reply.strip():
                    interrupted = self.interrupt_event.is_set()
                    print(f"🤖 [text_worker] reply ready: {len(full_reply)} chars, "
                          f"interrupted={interrupted}")

                    # Send full text to frontend
                    self.outgoing_queue.put({
                        "type": "json",
                        "data": {"type": "response", "text": full_reply}
                    })

                    # Save agent message to DB
                    asyncio.run_coroutine_threadsafe(
                        self._add_message_async(full_reply, "agent"),
                        self.loop
                    )

                    # Queue full text for TTS (only if not interrupted)
                    if not interrupted:
                        self.tts_queue.put(full_reply)
                    else:
                        print("⏭️ [text_worker] skipping TTS queue — already interrupted")

            except Exception as e:
                print(f"❌ Gemini error: {e}")
                traceback.print_exc()

    # -------------------------
    # TTS Worker (Edge-TTS, sentence by sentence)
    # -------------------------

    def _tts_worker(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        print("🔊 [tts_worker] started")

        while not self.shutdown_event.is_set():
            try:
                text = self.tts_queue.get(timeout=0.1)
            except queue.Empty:
                continue

            if not text.strip():
                continue

            # NOTE: Do NOT clear interrupt_event here.
            # _text_worker already cleared it before the Gemini call.
            # Clearing it here would swallow a barge-in that arrived
            # during the Gemini streaming delay.
            self.is_speaking = True

            # Split into sentences so we can interrupt between them
            sentences = split_into_sentences(text)
            print(f"🔊 Speaking {len(sentences)} sentence(s)...")

            try:
                for i, sentence in enumerate(sentences):
                    # Check interrupt before each sentence
                    if self.interrupt_event.is_set():
                        print(f"🛑 TTS interrupted at sentence {i+1}/{len(sentences)}")
                        # FIX: Do NOT send stop_audio here — the VAD already sent it
                        # when it detected speech. Sending again causes duplicate resets.
                        break

                    if not sentence.strip():
                        continue

                    try:
                        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as f:
                            filename = f.name
                        self.temp_files.append(filename)

                        # Generate audio for this sentence
                        t0 = time.time()
                        loop.run_until_complete(self._generate_audio(sentence, filename))
                        gen_ms = int((time.time() - t0) * 1000)

                        # Check interrupt again after generation (generation takes time)
                        if self.interrupt_event.is_set():
                            print(f"🛑 [tts_worker] interrupted after generating sentence {i+1} ({gen_ms}ms)")
                            # Do NOT send stop_audio here — VAD already sent it
                            break

                        with open(filename, "rb") as af:
                            audio_data = af.read()

                        print(f"🔊 [tts_worker] sentence {i+1}/{len(sentences)} "
                              f"{len(audio_data)//1024}KB in {gen_ms}ms: '{sentence[:40]}'")

                        # Signal chunk start
                        self.outgoing_queue.put({
                            "type": "json",
                            "data": {
                                "type": "tts_chunk_start",
                                "sentence_index": i,
                                "total": len(sentences)
                            }
                        })

                        # Send the audio bytes
                        self.outgoing_queue.put({
                            "type": "bytes",
                            "data": audio_data
                        })

                    except Exception as e:
                        print(f"❌ TTS sentence error: {e}")
                        traceback.print_exc()

                # Notify frontend that AI finished speaking
                if not self.interrupt_event.is_set():
                    self.outgoing_queue.put({
                        "type": "json",
                        "data": {"type": "tts_done"}
                    })
                    print("✅ TTS fully done")

            except Exception as e:
                print(f"❌ TTS worker error: {e}")
                traceback.print_exc()

            finally:
                # FIX: Always reset is_speaking so interrupt detection resets
                self.is_speaking = False


# =============================
# REST Endpoints
# =============================

@app.get("/")
async def root():
    return {"message": "Voice Agent API"}

@app.get("/api/chats", response_model=List[ChatModel])
async def get_chats():
    chats = await chats_collection.find().sort("updated_at", -1).to_list(100)
    for chat in chats:
        chat["id"] = str(chat["_id"])
        messages = await messages_collection.find(
            {"chat_id": str(chat["_id"])}
        ).sort("timestamp", 1).to_list(100)
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
# WebSocket Endpoint
# =============================

@app.websocket("/ws/voice")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("🔌 WebSocket connected")

    session = None
    send_task = None

    try:
        # -------------------------
        # 1. Wait for init message
        # -------------------------
        try:
            init_msg = await asyncio.wait_for(websocket.receive_text(), timeout=10)
            init = json.loads(init_msg)

            if init.get("type") != "init" or "chatId" not in init:
                await websocket.close(code=1003, reason="Invalid init")
                return

            chat_id = init["chatId"]
            print(f"✅ Initialized chat: {chat_id}")

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

        # Build history with role-alternation guard.
        # Gemini requires strictly alternating user/model turns.
        # Consecutive same-role messages from DB would crash start_chat().
        raw_history = [
            {
                "role": "user" if m["sender"] == "user" else "model",
                "parts": [m["text"]],
            }
            for m in messages
        ]
        history: list = []
        for entry in raw_history:
            if history and history[-1]["role"] == entry["role"]:
                # Merge consecutive same-role messages into one turn
                history[-1]["parts"].append(entry["parts"][0])
            else:
                history.append(entry)

        # -------------------------
        # 3. Start voice session
        # -------------------------
        session = VoiceSession(websocket, chat_id, history)
        session.start()
        print("🎙️ VoiceSession started")

        # -------------------------
        # 4. Outgoing sender task
        # -------------------------
        async def send_loop():
            try:
                while not session.shutdown_event.is_set():
                    try:
                        item = session.outgoing_queue.get_nowait()
                    except queue.Empty:
                        await asyncio.sleep(0.02)
                        continue

                    try:
                        if item["type"] == "json":
                            await websocket.send_json(item["data"])
                        elif item["type"] == "bytes":
                            await websocket.send_bytes(item["data"])
                    except Exception as e:
                        print(f"❌ Send error: {e}")
                        break

            except asyncio.CancelledError:
                pass

        send_task = asyncio.create_task(send_loop())

        # -------------------------
        # 5. Receive loop
        # -------------------------
        while True:
            try:
                msg = await websocket.receive()

                if msg["type"] == "websocket.disconnect":
                    print("🔌 Client disconnected")
                    break

                # Raw PCM audio bytes from microphone
                if "bytes" in msg:
                    session.audio_queue.put(msg["bytes"])

                # Text commands from frontend
                elif "text" in msg:
                    try:
                        data = json.loads(msg["text"])
                        if data.get("type") == "command":
                            cmd = data.get("command")
                            if cmd == "stop":
                                print("⏹️ Stop command received")
                                session.interrupt_event.set()
                                session.outgoing_queue.put({
                                    "type": "json",
                                    "data": {"type": "stop_audio"}
                                })
                    except json.JSONDecodeError:
                        pass

            except WebSocketDisconnect:
                print("🔌 WebSocket disconnected")
                break
            except Exception as e:
                print(f"❌ Receive error: {e}")
                break

    finally:
        if send_task and not send_task.done():
            send_task.cancel()
            try:
                await send_task
            except asyncio.CancelledError:
                pass

        if session:
            session.stop()

        print("🧹 WebSocket cleaned up")


# =============================
# Start Server
# =============================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)