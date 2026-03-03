import { useState, useEffect, useRef } from 'react';
import { Message, Chat } from '../types';

const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/voice';

export const useVoiceWebSocket = () => {
  console.log('🔄 useVoiceWebSocket hook initializing');

  // ── States
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  // ── Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const initSentRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Fetch chats once on mount
  useEffect(() => {
    fetchChats();
  }, []);

  const fetchChats = async () => {
    console.log('📡 fetchChats: starting API call');
    try {
      const res = await fetch(`${API_URL}/api/chats`);
      const data = await res.json();

      setChats(
        data.map((chat: any) => ({
          ...chat,
          id: chat.id || Math.random().toString(36).substring(2, 9),
          createdAt: new Date(chat.created_at),
          updatedAt: new Date(chat.updated_at),
          messages: chat.messages?.map((msg: any) => ({
            ...msg,
            id: msg.id || Math.random().toString(36).substring(2, 9),
            timestamp: new Date(msg.timestamp)
          })) || []
        }))
      );

      console.log('✅ fetchChats: received', data.length, 'chats');
    } catch (error) {
      console.error('❌ fetchChats failed', error);
    }
  };

  // ── WebSocket connection (only when currentChatId changes)
 useEffect(() => {
  if (!currentChatId) return;

  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    connectWebSocket(currentChatId);
  }
}, [currentChatId]);

  const connectWebSocket = (chatId: string) => {
  if (wsRef.current) {
    if (
      wsRef.current.readyState === WebSocket.OPEN ||
      wsRef.current.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
  }

  console.log("🔌 Connecting WebSocket...");

  wsRef.current = new WebSocket(WS_URL);

  wsRef.current.onopen = () => {
    console.log('✅ WebSocket connected');
    setIsConnected(true);
    initSentRef.current = false;
    sendInit(chatId);
  };

  wsRef.current.onmessage = handleMessage;

  wsRef.current.onclose = () => {
    console.log('⚠️ WebSocket disconnected');
    setIsConnected(false);
  };

  wsRef.current.onerror = (err) => {
    console.error('❌ WebSocket error:', err);
  };
};

  const sendInit = (chatId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (initSentRef.current) return;

    wsRef.current.send(JSON.stringify({ type: 'init', chatId }));
    initSentRef.current = true;
    console.log('📤 Sent init message for chat:', chatId);
  };

  // ── Create new chat
  const createNewChat = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Voice Conversation' })
      });
      const chat = await res.json();
      const newChat: Chat = {
        ...chat,
        id: chat.id || Math.random().toString(36).substring(2, 9),
        createdAt: new Date(chat.created_at),
        updatedAt: new Date(chat.updated_at),
        messages: []
      };

      setChats((prev) => [newChat, ...prev]);
      setCurrentChatId(newChat.id);
      console.log('➕ Created new chat with id:', newChat.id);
      return newChat.id;
    } catch (error) {
      console.error('❌ createNewChat failed', error);
      return null;
    }
  };

  // ── Add message
  const addMessage = async (chatId: string, text: string, sender: 'user' | 'agent') => {
    try {
      const res = await fetch(`${API_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, sender })
      });
      const msg = await res.json();

      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id === chatId) {
            const newMsg: Message = {
              id: msg.id || Math.random().toString(36).substring(2, 9),
              text: msg.text,
              sender: msg.sender,
              timestamp: new Date(msg.timestamp)
            };

            let title = chat.title;
            if (chat.messages.length === 0 && sender === 'user') {
              title = text.slice(0, 30) + (text.length > 30 ? '...' : '');
            }

            return {
              ...chat,
              title,
              messages: [...chat.messages, newMsg],
              updatedAt: new Date()
            };
          }
          return chat;
        })
      );
    } catch (error) {
      console.error('❌ addMessage failed', error);
    }
  };

  // ── WebSocket message handler
  const handleMessage = async (event: MessageEvent) => {
    if (typeof event.data === 'string') {
      const data = JSON.parse(event.data);

      if (data.type === 'transcript') {
        setCurrentTranscript(data.text);
        setIsProcessing(true);
      } else if (data.type === 'response') {
        setIsProcessing(false);
        setIsSpeaking(true);
        if (currentChatId) await addMessage(currentChatId, data.text, 'agent');
      } else if (data.type === 'error') {
        console.error('❌ Server error:', data.message);
      }
    } else {
      // Audio
      const audioBlob = new Blob([event.data], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsSpeaking(false);
      audio.play();
    }
  };

  // ── Microphone
  const startMicrophoneStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        const FRAME_SIZE = 480;
        for (let offset = 0; offset + FRAME_SIZE <= pcmData.length; offset += FRAME_SIZE) {
          const frame = pcmData.slice(offset, offset + FRAME_SIZE);
          // 🔇 Silence detection
let sum = 0;
for (let i = 0; i < frame.length; i++) {
  sum += Math.abs(frame[i]);
}
const avg = sum / frame.length;

if (wsRef.current?.readyState === WebSocket.OPEN) {
  wsRef.current.send(new Uint8Array(frame.buffer));
}
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
      setIsListening(true);
      setCurrentTranscript('');
    } catch (err) {
      console.error('❌ Microphone error:', err);
    }
  };

 const startListening = async () => {
  let chatId = currentChatId;

  if (!chatId) {
    chatId = await createNewChat();
  }

  if (!chatId) return;

  // Wait for websocket
  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    connectWebSocket(chatId);

    setTimeout(() => {
      startMicrophoneStream();
    }, 1000); // wait 1 sec
  } else {
    startMicrophoneStream();
  }
};

 const stopListening = () => {

  // 👉 Tell backend to stop
  if (wsRef.current?.readyState === WebSocket.OPEN) {
    wsRef.current.send(
      JSON.stringify({ type: 'command', command: 'stop' })
    );
  }

  // Stop audio
  processorRef.current?.disconnect();
  sourceRef.current?.disconnect();
  audioContextRef.current?.close();
  streamRef.current?.getTracks().forEach((t) => t.stop());

  processorRef.current = null;
  sourceRef.current = null;
  audioContextRef.current = null;
  streamRef.current = null;

  setIsListening(false);
  setIsProcessing(false); // ❗ change this
};

  const selectChat = (chatId: string) => {
    setCurrentChatId(chatId);
    initSentRef.current = false;
    sendInit(chatId);
  };

  const deleteChat = async (chatId: string) => {
    try {
      await fetch(`${API_URL}/api/chats/${chatId}`, { method: 'DELETE' });
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));
      if (currentChatId === chatId) setCurrentChatId(chats.length ? chats[0].id : null);
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
    createNewChat,
    selectChat,
    deleteChat,
    startListening,
    stopListening,
  };
};