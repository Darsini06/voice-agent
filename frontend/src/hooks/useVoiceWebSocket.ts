// src/hooks/useVoiceWebSocket.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { Message, Chat } from '../types';

const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/voice';

export const useVoiceWebSocket = () => {
  console.log('🔄 useVoiceWebSocket hook initializing');

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load chats from API
  useEffect(() => {
    console.log('🔍 useEffect: fetching chats on mount');
    fetchChats();
  }, []);

  const fetchChats = async () => {
    console.log('📡 fetchChats: starting API call');
    try {
      const response = await fetch(`${API_URL}/api/chats`);
      const data = await response.json();
      console.log('✅ fetchChats: received', data.length, 'chats');
      setChats(data.map((chat: any) => ({
        ...chat,
        createdAt: new Date(chat.created_at),
        updatedAt: new Date(chat.updated_at),
        messages: chat.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      })));
    } catch (error) {
      console.error('❌ fetchChats: failed', error);
    }
  };

  // WebSocket connection
  useEffect(() => {
    console.log('🔌 useEffect: setting up WebSocket');
    connectWebSocket();
    return () => {
      console.log('🔌 Cleanup: closing WebSocket');
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    console.log('🛜 connectWebSocket: connecting to', WS_URL);
    wsRef.current = new WebSocket(WS_URL);
    
    wsRef.current.onopen = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
    };
    
    wsRef.current.onmessage = async (event) => {
      console.log('📨 WebSocket message received, type:', typeof event.data);
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        console.log('📝 Text message:', data);
        
        if (data.type === 'transcript') {
          setCurrentTranscript(data.text);
          console.log('✏️ Transcript updated:', data.text);
        } else if (data.type === 'response') {
          setIsProcessing(false);
          setIsSpeaking(true);
          console.log('🤖 Agent response received:', data.text);
          
          if (currentChatId) {
            await addMessage(currentChatId, data.text, 'agent');
          }
        }
      } else {
        console.log('🔊 Audio message received, size:', event.data.size, 'bytes');
        const audioBlob = new Blob([event.data], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        audio.onended = () => {
          console.log('🔇 Audio playback finished');
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };
        
        audio.play();
        console.log('▶️ Playing audio');
      }
    };
    
    wsRef.current.onclose = () => {
      console.log('⚠️ WebSocket disconnected');
      setIsConnected(false);
      console.log('🔄 Attempting reconnect in 3s');
      setTimeout(connectWebSocket, 3000);
    };
    
    wsRef.current.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
  };

  const createNewChat = async () => {
    console.log('➕ createNewChat: creating new chat');
    try {
      const response = await fetch(`${API_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Voice Conversation' })
      });
      const newChat = await response.json();
      console.log('✅ Chat created with id:', newChat.id);
      setChats(prev => [{
        ...newChat,
        createdAt: new Date(newChat.created_at),
        updatedAt: new Date(newChat.updated_at),
        messages: []
      }, ...prev]);
      setCurrentChatId(newChat.id);
      console.log('🆔 Current chat ID set to:', newChat.id);
      return newChat.id;
    } catch (error) {
      console.error('❌ createNewChat: failed', error);
    }
  };

  const addMessage = async (chatId: string, text: string, sender: 'user' | 'agent') => {
    console.log(`💬 addMessage: chatId=${chatId}, sender=${sender}, text="${text}"`);
    try {
      const response = await fetch(`${API_URL}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, sender })
      });
      const message = await response.json();
      console.log('✅ Message saved with id:', message.id);
      
      setChats(prev => prev.map(chat => {
        if (chat.id === chatId) {
          const newMessage = {
            id: message.id,
            text: message.text,
            sender: message.sender,
            timestamp: new Date(message.timestamp)
          };
          
          let title = chat.title;
          if (chat.messages.length === 0 && sender === 'user') {
            title = text.slice(0, 30) + (text.length > 30 ? '...' : '');
            console.log('📝 Chat title updated to:', title);
          }
          
          return {
            ...chat,
            title,
            messages: [...chat.messages, newMessage],
            updatedAt: new Date()
          };
        }
        return chat;
      }));
    } catch (error) {
      console.error('❌ addMessage: failed', error);
    }
  };

  const deleteChat = async (chatId: string) => {
    console.log('🗑️ deleteChat: deleting chat', chatId);
    try {
      await fetch(`${API_URL}/api/chats/${chatId}`, {
        method: 'DELETE'
      });
      console.log('✅ Chat deleted');
      setChats(prev => prev.filter(chat => chat.id !== chatId));
      if (currentChatId === chatId) {
        const newCurrentId = chats.length > 1 ? chats[0].id : null;
        setCurrentChatId(newCurrentId);
        console.log('🆕 Current chat ID updated to:', newCurrentId);
      }
    } catch (error) {
      console.error('❌ deleteChat: failed', error);
    }
  };

  const startListening = async () => {
    console.log('🎤 startListening: called');
    if (!currentChatId) {
      console.log('🆕 No current chat, creating new one...');
      const newId = await createNewChat();
      if (newId) {
        setCurrentChatId(newId);
      }
    }

    try {
      console.log('🎙️ Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ Microphone access granted');
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log('📦 Audio chunk available, size:', event.data.size);
        audioChunksRef.current.push(event.data);
      };
      
      mediaRecorderRef.current.onstop = async () => {
        console.log('⏹️ Recording stopped, processing audio...');
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        console.log('📤 Sending audio to WebSocket, size:', arrayBuffer.byteLength);
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(arrayBuffer);
        } else {
          console.warn('⚠️ WebSocket not open, cannot send audio');
        }
        
        stream.getTracks().forEach(track => track.stop());
        console.log('🔇 Microphone tracks stopped');
      };
      
      mediaRecorderRef.current.start();
      setIsListening(true);
      setCurrentTranscript('');
      console.log('🎙️ Recording started');
    } catch (error) {
      console.error('❌ startListening: failed', error);
    }
  };

  const stopListening = () => {
    console.log('⏹️ stopListening: called');
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setIsProcessing(true);
      console.log('⏳ Processing started, listening stopped');
      
      if (currentChatId && currentTranscript) {
        console.log('💾 Adding user message to chat');
        addMessage(currentChatId, currentTranscript, 'user');
      }
    } else {
      console.warn('⚠️ stopListening called but not listening');
    }
  };

  const selectChat = (chatId: string) => {
    console.log('📂 selectChat: switching to chat', chatId);
    setCurrentChatId(chatId);
  };

  const currentChat = chats.find(chat => chat.id === currentChatId);
  console.log('📊 Current state: chats count =', chats.length, 'currentChatId =', currentChatId);

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
    stopListening
  };
};