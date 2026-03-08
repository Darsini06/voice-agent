import { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Chat } from '../types';

const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/voice';

export const useVoiceWebSocket = () => {
  // ── States
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // ── Refs (stable across renders)
  const wsRef = useRef<WebSocket | null>(null);
  const initSentRef = useRef<boolean>(false);
  const currentChatIdRef = useRef<string | null>(null);

  // Audio pipeline
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Audio playback queue
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // KEY FIX: When mic button is clicked and WS isn't open yet,
  // set this flag so ws.onopen starts the mic automatically.
  const pendingMicStartRef = useRef<boolean>(false);

  // Keep ref in sync with state so callbacks always read the latest chatId
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  // ── Fetch chats on mount
  useEffect(() => {
    fetchChats();
  }, []);

  // ── WebSocket: open/replace whenever the selected chat changes
  // This is the ONLY place that creates a WebSocket.
  // startListening never creates its own — it sets pendingMicStartRef instead.
  useEffect(() => {
    if (!currentChatId) return;
    openWebSocket(currentChatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId]);

  // ── Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicrophoneStream();
      closeWebSocket();
    };
  }, []);

  // ─────────────────────────────────────────────────────
  // WebSocket helpers
  // ─────────────────────────────────────────────────────

  const closeWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    initSentRef.current = false;
    setIsConnected(false);
  };

  // openWebSocket is the single source-of-truth for WS creation.
  // It is called by the useEffect above — never by startListening directly.
  const openWebSocket = (chatId: string) => {
    console.log(`🔌 openWebSocket chatId=${chatId}`);

    // Null out handlers before closing so old close-event can't fire
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    initSentRef.current = false;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`✅ WS OPEN — chatId=${chatId}`);
      setIsConnected(true);
      // Send init message
      ws.send(JSON.stringify({ type: 'init', chatId }));
      initSentRef.current = true;
      console.log(`📤 init sent for chatId=${chatId}`);

      // KEY FIX: If user clicked mic while WS was still connecting,
      // start the mic now that the socket is confirmed open.
      if (pendingMicStartRef.current) {
        console.log('🎙️ pendingMicStart=true — starting mic after WS open');
        pendingMicStartRef.current = false;
        startMicrophoneStream();
      }
    };

    ws.onmessage = handleMessage;

    ws.onclose = (ev) => {
      console.warn(`⚠️ WS CLOSED code=${ev.code} reason=${ev.reason}`);
      setIsConnected(false);
      initSentRef.current = false;
    };

    ws.onerror = (err) => {
      console.error('❌ WS ERROR:', err);
    };
  };

  // ─────────────────────────────────────────────────────
  // Audio queue player
  // ─────────────────────────────────────────────────────

  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      // Queue fully drained — AI is done speaking
      console.log('🔇 Audio queue drained — isSpeaking = false');
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const url = audioQueueRef.current.shift()!;
    console.log(`▶️ Playing audio chunk, ${audioQueueRef.current.length} remaining`);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      playNextAudio();
    };

    audio.onerror = (e) => {
      console.error('❌ Audio playback error:', e);
      playNextAudio();
    };

    audio.play().catch((e) => {
      console.error('❌ Audio play() failed:', e);
      playNextAudio();
    });
  }, []);

  const stopAudioPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    audioQueueRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
    console.log('🛑 Audio playback stopped and queue cleared');
  }, []);

  // ─────────────────────────────────────────────────────
  // Fetch chats
  // ─────────────────────────────────────────────────────

  const fetchChats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chats`);
      const data = await res.json();
      setChats(
        data.map((chat: any) => ({
          ...chat,
          id: chat.id || Math.random().toString(36).substring(2, 9),
          createdAt: new Date(chat.created_at),
          updatedAt: new Date(chat.updated_at),
          messages:
            chat.messages?.map((msg: any) => ({
              ...msg,
              id: msg.id || Math.random().toString(36).substring(2, 9),
              timestamp: new Date(msg.timestamp),
            })) || [],
        }))
      );
      console.log('✅ fetchChats: received', data.length, 'chats');
    } catch (error) {
      console.error('❌ fetchChats failed', error);
    }
  };

  // ─────────────────────────────────────────────────────
  // Local UI message update (backend saves to DB)
  // ─────────────────────────────────────────────────────

  const addMessageLocally = useCallback(
    (chatId: string, text: string, sender: 'user' | 'agent') => {
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatId) return chat;
          const newMsg: Message = {
            id: Math.random().toString(36).substring(2, 9),
            text,
            sender,
            timestamp: new Date(),
          };
          let title = chat.title;
          if (chat.messages.length === 0 && sender === 'user') {
            title = text.slice(0, 40) + (text.length > 40 ? '...' : '');
          }
          return {
            ...chat,
            title,
            messages: [...chat.messages, newMsg],
            updatedAt: new Date(),
          };
        })
      );
    },
    []
  );

  // ─────────────────────────────────────────────────────
  // WebSocket message handler
  // ─────────────────────────────────────────────────────

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          console.error('❌ Failed to parse WS message:', event.data);
          return;
        }

        console.log('📩 WS message:', data.type);

        if (data.type === 'transcript') {
          setCurrentTranscript(data.text);
          setIsProcessing(true);
          const chatId = currentChatIdRef.current;
          if (chatId) addMessageLocally(chatId, data.text, 'user');

        } else if (data.type === 'response') {
          setIsProcessing(false);
          const chatId = currentChatIdRef.current;
          if (chatId) addMessageLocally(chatId, data.text, 'agent');

        } else if (data.type === 'stop_audio') {
          console.log('🛑 stop_audio received — clearing audio queue');
          stopAudioPlayback();
          setIsProcessing(false);

        } else if (data.type === 'tts_chunk_start') {
          console.log(`🔊 TTS chunk ${data.sentence_index + 1}/${data.total} incoming`);
          setIsSpeaking(true);

        } else if (data.type === 'tts_done') {
          // Do NOT set isSpeaking=false here — wait for audio queue to drain
          // in playNextAudio → onended chain to avoid a race condition.
          console.log('✅ tts_done received — waiting for audio queue to drain');

        } else if (data.type === 'error') {
          console.error('❌ Server error:', data.message);
          setIsProcessing(false);
          setIsSpeaking(false);
        }

      } else {
        // Binary: audio chunk (MP3)
        const audioBlob = new Blob([event.data], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioQueueRef.current.push(audioUrl);
        if (!isPlayingRef.current) {
          playNextAudio();
        }
      }
    },
    [addMessageLocally, stopAudioPlayback, playNextAudio]
  );

  // ─────────────────────────────────────────────────────
  // Microphone
  // ─────────────────────────────────────────────────────

  const startMicrophoneStream = async () => {
    console.log('🎙️ startMicrophoneStream: requesting getUserMedia...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.log('🎙️ getUserMedia granted');

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // 4096 is the nearest valid power-of-2 buffer size.
      // 4096 / 480 = 8 full frames + 256 leftover samples per callback.
      // We use a leftover buffer to carry partial samples across callbacks
      // so every frame sent to the backend is exactly 480 samples.
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let leftover = new Int16Array(0); // carry-over from previous callback
      let framesSent = 0;
      let framesDropped = 0;

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const newPcm = new Int16Array(inputData.length);

        // float32 → int16 PCM
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          newPcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // RMS amplitude for visualizer (0–255)
        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) sumSq += inputData[i] * inputData[i];
        setAudioLevel(Math.min(255, Math.round(Math.sqrt(sumSq / inputData.length) * 255 * 8)));

        // Prepend any leftover samples from last callback
        const combined = new Int16Array(leftover.length + newPcm.length);
        combined.set(leftover, 0);
        combined.set(newPcm, leftover.length);

        // Emit complete 480-sample frames
        const FRAME_SIZE = 480;
        let offset = 0;
        while (offset + FRAME_SIZE <= combined.length) {
          const frame = combined.slice(offset, offset + FRAME_SIZE);
          offset += FRAME_SIZE;

          // Always send every frame to the backend.
          // The backend's WebRTC VAD decides what is speech vs silence.
          // Dropping silence frames here prevents the VAD's silence_counter
          // from ever reaching SILENCE_LIMIT, which means Whisper never fires.
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(new Uint8Array(frame.buffer));
            framesSent++;
            if (framesSent % 100 === 0) {
              console.log(`🎙️ sent=${framesSent} dropped=${framesDropped}`);
            }
          } else {
            framesDropped++;
            if (framesDropped === 1 || framesDropped % 100 === 0) {
              console.warn(`⚠️ WS not OPEN (state=${wsRef.current?.readyState}), frames dropped=${framesDropped}`);
            }
          }
        }

        // Save incomplete trailing samples for next callback
        leftover = combined.slice(offset);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsListening(true);
      setCurrentTranscript('');
      console.log('✅ Microphone stream ACTIVE');
    } catch (err) {
      console.error('❌ Microphone error:', err);
      pendingMicStartRef.current = false;
    }
  };

  const stopMicrophoneStream = () => {
    console.log('🛑 stopMicrophoneStream');
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioContextRef.current?.close().catch((e) => console.error('⚠️ AudioContext close:', e));
    streamRef.current?.getTracks().forEach((t) => t.stop());

    processorRef.current = null;
    sourceRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
    setAudioLevel(0);
  };

  // ─────────────────────────────────────────────────────
  // Start / Stop Listening
  // ─────────────────────────────────────────────────────

  const startListening = async () => {
    let chatId = currentChatIdRef.current;
    console.log(`🎙️ startListening — chatId=${chatId} wsState=${wsRef.current?.readyState}`);

    // Create a new chat if none is selected
    if (!chatId) {
      console.log('➕ Creating new chat...');
      chatId = await createNewChat();
    }
    if (!chatId) {
      console.error('❌ startListening: still no chatId, aborting');
      return;
    }

    const wsState = wsRef.current?.readyState;

    if (wsState === WebSocket.OPEN) {
      // WS already connected — start mic immediately
      console.log('🟢 WS OPEN — starting mic now');
      startMicrophoneStream();

    } else {
      // WS is CONNECTING or doesn't exist yet.
      // Set the pending flag so ws.onopen will start the mic once the socket opens.
      // The useEffect owns WS creation — don't create another socket here.
      console.log(`🟡 WS not ready (state=${wsState}) — setting pendingMicStart`);
      pendingMicStartRef.current = true;

      // If WS doesn't exist at all (e.g. chat was just created and effect hasn't run),
      // kick off the connection manually now.
      if (!wsRef.current) {
        console.log('� No WS exists yet — opening now');
        openWebSocket(chatId);
      }
      // If CONNECTING, the pending flag will be checked in its own ws.onopen
    }
  };

  const stopListening = () => {
    console.log('🛑 stopListening');
    pendingMicStartRef.current = false;

    // Tell backend to stop
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'command', command: 'stop' }));
    }

    stopMicrophoneStream();
    stopAudioPlayback();

    setIsListening(false);
    setIsProcessing(false);
    console.log('🛑 Listening stopped');
  };

  // ─────────────────────────────────────────────────────
  // Chat Management
  // ─────────────────────────────────────────────────────

  const createNewChat = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Voice Conversation' }),
      });
      const chat = await res.json();

      const newChat: Chat = {
        ...chat,
        id: chat.id || Math.random().toString(36).substring(2, 9),
        createdAt: new Date(chat.created_at),
        updatedAt: new Date(chat.updated_at),
        messages: [],
      };

      setChats((prev) => [newChat, ...prev]);
      setCurrentChatId(newChat.id);
      currentChatIdRef.current = newChat.id; // sync ref immediately
      console.log('➕ Created new chat:', newChat.id);
      return newChat.id;
    } catch (error) {
      console.error('❌ createNewChat failed', error);
      return null;
    }
  };

  const selectChat = (chatId: string) => {
    if (chatId === currentChatIdRef.current) return;

    console.log('💬 Switching to chat:', chatId);
    pendingMicStartRef.current = false;

    // Stop mic if active
    if (streamRef.current) {
      stopMicrophoneStream();
      setIsListening(false);
    }

    stopAudioPlayback();
    setIsProcessing(false);
    setCurrentTranscript('');
    setCurrentChatId(chatId);
    // useEffect fires → openWebSocket(chatId)
  };

  const deleteChat = async (chatId: string) => {
    try {
      await fetch(`${API_URL}/api/chats/${chatId}`, { method: 'DELETE' });
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));

      if (currentChatIdRef.current === chatId) {
        const remaining = chats.filter((c) => c.id !== chatId);
        const nextId = remaining.length ? remaining[0].id : null;
        closeWebSocket();
        setCurrentChatId(nextId);
      }
    } catch (err) {
      console.error('❌ deleteChat failed', err);
    }
  };

  const currentChat = chats.find((c) => c.id === currentChatId) || null;

  return {
    chats,
    currentChat,
    currentChatId,
    isListening,
    isSpeaking,
    isProcessing,
    currentTranscript,
    isConnected,
    audioLevel,
    createNewChat,
    selectChat,
    deleteChat,
    startListening,
    stopListening,
  };
};