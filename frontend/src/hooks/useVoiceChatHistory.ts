// src/hooks/useVoiceChatHistory.ts
import { useState, useCallback, useEffect } from 'react';
import { VoiceMessage, VoiceChat, VoiceChatState } from '../types';

// Mock AI responses
const AI_RESPONSES = [
  "I hear you! How can I assist you today?",
  "That's interesting. Tell me more about that.",
  "I understand what you're saying. Let me help you with that.",
  "Thanks for sharing. Based on what you said, here's what I think...",
  "Great question! Let me provide some information about that.",
  "I'm listening. What else would you like to know?",
  "That makes sense. Here's what I can do for you.",
  "Interesting point! Let me think about that for a moment.",
];

// Load chats from localStorage
const loadChats = (): VoiceChat[] => {
  try {
    const saved = localStorage.getItem('voice-chats');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((chat: any) => ({
        ...chat,
        createdAt: new Date(chat.createdAt),
        updatedAt: new Date(chat.updatedAt),
        messages: chat.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
    }
  } catch (e) {
    console.error('Failed to load chats:', e);
  }
  return [];
};

export const useVoiceChatHistory = () => {
  const [state, setState] = useState<VoiceChatState>(() => {
    const chats = loadChats();
    return {
      currentChatId: chats.length > 0 ? chats[0].id : null,
      chats,
      activeConnections: Math.floor(Math.random() * 50) + 100,
      isListening: false,
      isSpeaking: false,
      isProcessing: false,
      currentTranscript: '',
    };
  });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('voice-chats', JSON.stringify(state.chats));
  }, [state.chats]);

  const currentChat = state.chats.find(chat => chat.id === state.currentChatId);

  const createNewChat = useCallback(() => {
    const newChat: VoiceChat = {
      id: Date.now().toString(),
      title: 'New Voice Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setState(prev => ({
      ...prev,
      chats: [newChat, ...prev.chats],
      currentChatId: newChat.id,
    }));

    return newChat.id;
  }, []);

  const selectChat = useCallback((chatId: string) => {
    setState(prev => ({
      ...prev,
      currentChatId: chatId,
    }));
  }, []);

  const deleteChat = useCallback((chatId: string) => {
    setState(prev => {
      const filtered = prev.chats.filter(chat => chat.id !== chatId);
      return {
        ...prev,
        chats: filtered,
        currentChatId: prev.currentChatId === chatId 
          ? (filtered.length > 0 ? filtered[0].id : null)
          : prev.currentChatId,
      };
    });
  }, []);

  const addMessage = useCallback((chatId: string, text: string, sender: 'user' | 'agent') => {
    const message: VoiceMessage = {
      id: Date.now().toString() + Math.random(),
      text,
      sender,
      timestamp: new Date(),
    };

    setState(prev => ({
      ...prev,
      chats: prev.chats.map(chat => {
        if (chat.id === chatId) {
          const updatedMessages = [...chat.messages, message];
          const updatedTitle = chat.messages.length === 0 && sender === 'user'
            ? text.slice(0, 30) + (text.length > 30 ? '...' : '')
            : chat.title;

          return {
            ...chat,
            messages: updatedMessages,
            title: updatedTitle,
            updatedAt: new Date(),
          };
        }
        return chat;
      }),
    }));

    return message;
  }, []);

  const simulateAIResponse = useCallback(async (chatId: string, userMessage: string) => {
    setState(prev => ({ ...prev, isProcessing: true }));

    // Simulate thinking
    await new Promise(resolve => setTimeout(resolve, 1500));

    const randomResponse = AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)];
    const responseText = `${randomResponse} (regarding "${userMessage.slice(0, 30)}...")`;

    addMessage(chatId, responseText, 'agent');

    setState(prev => ({ 
      ...prev, 
      isProcessing: false,
      isSpeaking: true,
    }));

    // Simulate speaking
    setTimeout(() => {
      setState(prev => ({ ...prev, isSpeaking: false }));
    }, 3000);
  }, [addMessage]);

  const startListening = useCallback(() => {
    if (!state.currentChatId) {
      const newChatId = createNewChat();
      setState(prev => ({ ...prev, currentChatId: newChatId }));
    }

    setState(prev => ({ 
      ...prev, 
      isListening: true,
      currentTranscript: '' 
    }));

    // Simulate voice input (replace with actual speech recognition)
    setTimeout(() => {
      if (state.isListening) {
        const demoQuestions = [
          "What's the weather like today?",
          "Tell me a joke",
          "How does this voice assistant work?",
          "What can you help me with?",
          "Explain quantum computing",
        ];
        const randomQuestion = demoQuestions[Math.floor(Math.random() * demoQuestions.length)];
        
        setState(prev => ({ ...prev, currentTranscript: randomQuestion }));
        
        // Auto-stop after getting transcript
        setTimeout(() => {
          stopListening();
        }, 1000);
      }
    }, 2000);
  }, [state.currentChatId, state.isListening, createNewChat]);

  const stopListening = useCallback(() => {
    setState(prev => ({ ...prev, isListening: false }));
    
    if (state.currentTranscript && state.currentChatId) {
      // Add user message
      addMessage(state.currentChatId, state.currentTranscript, 'user');
      
      // Get AI response
      simulateAIResponse(state.currentChatId, state.currentTranscript);
      
      setState(prev => ({ ...prev, currentTranscript: '' }));
    }
  }, [state.currentTranscript, state.currentChatId, addMessage, simulateAIResponse]);

  return {
    ...state,
    currentChat,
    createNewChat,
    selectChat,
    deleteChat,
    startListening,
    stopListening,
  };
};