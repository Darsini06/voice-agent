import sounddevice as sd
import numpy as np
import webrtcvad
import queue
import threading
import asyncio
import edge_tts
import pygame
import tempfile
import os
import time
import sys
from faster_whisper import WhisperModel
import google.generativeai as genai


# =============================
# GEMINI CONFIG
# =============================

genai.configure(api_key="AIzaSyA2ezQlB-3WJ5_Jhyyo3wXUOSsRVWpjmqM")  

gemini_model = genai.GenerativeModel("models/gemini-2.5-flash")

# 🔥 Conversation memory
chat = gemini_model.start_chat(history=[])


# def generate_reply(user_text):
#     try:
#         response = chat.send_message(user_text)
#         return response.text.strip()
#     except Exception as e:
#         print("⚠️ Gemini Error:", e)
#         return "Sorry, something went wrong."
def generate_reply(user_text):
    try:
        if interrupt_event.is_set():
            return None

        response = chat.send_message(
            user_text,
            stream=True  # 🔥 IMPORTANT
        )

        full_reply = ""

        for chunk in response:

            if interrupt_event.is_set():
                print("🛑 Gemini streaming interrupted!")
                return None

            if chunk.text:
                full_reply += chunk.text

        return full_reply.strip()

    except Exception as e:
        print("⚠️ Gemini Error:", e)
        return None
# =============================
# CONFIG
# =============================

SAMPLE_RATE = 16000
FRAME_DURATION = 30
FRAME_SIZE = int(SAMPLE_RATE * FRAME_DURATION / 1000)

model = WhisperModel(
    "base.en",
    device="cuda",
    compute_type="float16"
)

VOICE = "en-US-JennyNeural"

audio_queue = queue.Queue()
text_queue = queue.Queue()
tts_queue = queue.Queue()

shutdown_event = threading.Event()
is_speaking = False
interrupt_event = threading.Event()

pygame.mixer.init()


# =============================
# AUDIO CALLBACK
# =============================

def audio_callback(indata, frames, time_info, status):
    if status:
        return
    audio_queue.put(bytes(indata))


# =============================
# STT THREAD
# =============================

def audio_processor():
    global is_speaking

    vad = webrtcvad.Vad(3)
    voiced_frames = []
    silence_counter = 0
    SILENCE_LIMIT = 20

    while not shutdown_event.is_set():

        # if is_speaking:
        #     time.sleep(0.05)
        #     continue

        try:
            frame = audio_queue.get(timeout=0.1)
        except queue.Empty:
            continue

        if vad.is_speech(frame, SAMPLE_RATE):
            voiced_frames.append(frame)
            silence_counter = 0
        else:
            silence_counter += 1

        if silence_counter > SILENCE_LIMIT and voiced_frames:

            if len(voiced_frames) < 25:
                voiced_frames = []
                silence_counter = 0
                continue

            audio_data = b''.join(voiced_frames)
            voiced_frames = []
            silence_counter = 0

            audio_np = np.frombuffer(
                audio_data, dtype=np.int16
            ).astype(np.float32) / 32768.0

            segments, _ = model.transcribe(audio_np)

            full_text = ""
            for seg in segments:
                full_text += seg.text

            text = full_text.strip().lower()
            # 🔥 FAST STOP DETECTION
            if "stop" in text:
               print("🛑 Instant Interrupt detected!")
               interrupt_event.set()
               pygame.mixer.music.stop()
               voiced_frames = []
               silence_counter = 0
               continue

            if not text:
                continue

            words = text.split()

            if len(set(words)) == 1 and len(words) > 4:
                continue

            if all(c in ".!?, " for c in text):
                continue

            if len(words) < 2:
                continue

            print("🧑 You:", text)
            text_queue.put(text)


# =============================
# EDGE TTS
# =============================

async def generate_audio(text, filename):
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(filename)


# def tts_worker():
#     global is_speaking

#     loop = asyncio.new_event_loop()
#     asyncio.set_event_loop(loop)

#     while not shutdown_event.is_set():

#         try:
#             text = tts_queue.get(timeout=0.1)
#         except queue.Empty:
#             continue

#         if not text or len(text.strip()) < 2:
#             continue

#         is_speaking = True

#         try:
#             with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as f:
#                 filename = f.name

#             for attempt in range(2):
#                 try:
#                     loop.run_until_complete(generate_audio(text, filename))
#                     break
#                 except Exception as e:
#                     if attempt == 1:
#                         print("⚠️ TTS Error:", e)
#                         is_speaking = False
#                         continue
#                     time.sleep(1)

#             pygame.mixer.music.load(filename)
#             pygame.mixer.music.play()

#             while pygame.mixer.music.get_busy():
#                 time.sleep(0.1)

#             pygame.mixer.music.stop()
#             pygame.mixer.music.unload()
#             time.sleep(0.2)

#             try:
#                 os.remove(filename)
#             except:
#                 pass

#             time.sleep(0.3)

#         except Exception as e:
#             print("⚠️ Unexpected TTS crash:", e)

#         is_speaking = False

def tts_worker():
    global is_speaking

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    while not shutdown_event.is_set():

        try:
            text = tts_queue.get(timeout=0.1)
        except queue.Empty:
            continue

        if not text or len(text.strip()) < 2:
            continue

        interrupt_event.clear()
        is_speaking = True

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as f:
                filename = f.name

            loop.run_until_complete(generate_audio(text, filename))

            pygame.mixer.music.load(filename)
            pygame.mixer.music.play()

            # 🔥 Interrupt support
            while pygame.mixer.music.get_busy():

                if interrupt_event.is_set():
                    pygame.mixer.music.stop()
                    break

                time.sleep(0.05)

            pygame.mixer.music.stop()
            pygame.mixer.music.unload()

            try:
                os.remove(filename)
            except:
                pass

        except Exception as e:
            print("⚠️ TTS crash:", e)

        is_speaking = False
# =============================
# MAIN
# =============================

def main():

    print("🤖 FULL DUPLEX GEMINI VOICE ASSISTANT STARTED\n")
    print("Speak now...............!")

    stream = sd.RawInputStream(
        samplerate=SAMPLE_RATE,
        blocksize=FRAME_SIZE,
        dtype="int16",
        channels=1,
        callback=audio_callback,
    )

    stream.start()

    threading.Thread(target=audio_processor, daemon=True).start()
    threading.Thread(target=tts_worker, daemon=True).start()

    try:
        while True:

            try:
                text = text_queue.get(timeout=0.1)
            except queue.Empty:
                continue

            # 🔥 STOP COMMAND
            if "stop" in text:
                print("🛑 Interrupt detected!")
                interrupt_event.set()
                pygame.mixer.music.stop()
                continue

            # 🔥 EXIT COMMAND
            if any(w in text for w in ["exit", "quit", "bye"]):
                tts_queue.put("Stopping conversation. Goodbye.")
                time.sleep(2)
                break

            # 🔥 Gemini in background thread
            interrupt_event.clear()

            def gemini_worker(user_text):
                reply = generate_reply(user_text)

                if reply and not interrupt_event.is_set():
                    print("🤖 Gemini:", reply)
                    tts_queue.put(reply)
                else:
                    print("🛑 Gemini reply cancelled.")

            threading.Thread(
                target=gemini_worker,
                args=(text,),
                daemon=True
            ).start()

    except KeyboardInterrupt:
        print("\n🛑 Interrupted manually.")

    finally:
        shutdown_event.set()
        stream.stop()
        stream.close()
        pygame.mixer.quit()
        sys.exit()

if __name__ == "__main__":
    main()