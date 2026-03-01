// // src/hooks/useChat.ts
// import { useState, useCallback, useEffect } from 'react';
// import { ChatMessageType, ChatStateType } from "../types";

// const AGENT_RESPONSES = [
//   "I understand. Could you tell me more about that?",
//   "That's interesting! How can I help you with this?",
//   "I see. Let me help you with that request.",
//   "Thanks for sharing. Here's what I think...",
//   "Great question! Based on my understanding...",
//   "I appreciate your patience. Let me explain...",
//   "That's a valid point. Here's what we can do...",
//   "I'm here to help! What specific information do you need?",
// ];

// export const useChat = () => {
//   const [state, setState] = useState<ChatStateType>({
//     messages: [],
//     activeConnections: Math.floor(Math.random() * 50) + 100, // Random between 100-150
//     isTyping: false,
//   });

//   const simulateAgentResponse = useCallback(async (userMessage: string) => {
//     setState(prev => ({ ...prev, isTyping: true }));

//     // Simulate typing delay
//     await new Promise(resolve => setTimeout(resolve, 1500));

//     const randomResponse = AGENT_RESPONSES[Math.floor(Math.random() * AGENT_RESPONSES.length)];
//     const agentMessage: ChatMessageType = {
//       id: Date.now().toString(),
//       text: `${randomResponse} Regarding "${userMessage.substring(0, 30)}..."`,
//       sender: 'agent',
//       timestamp: new Date(),
//     };

//     setState(prev => ({
//       ...prev,
//       messages: [...prev.messages, agentMessage],
//       isTyping: false,
//     }));
//   }, []);

//   const sendMessage = useCallback((text: string) => {
//     if (!text.trim()) return;

//     const userMessage: ChatMessageType = {
//       id: Date.now().toString(),
//       text,
//       sender: 'user',
//       timestamp: new Date(),
//     };

//     setState(prev => ({
//       ...prev,
//       messages: [...prev.messages, userMessage],
//     }));

//     simulateAgentResponse(text);
//   }, [simulateAgentResponse]);

//   // Simulate active connections updating
//   useEffect(() => {
//     const interval = setInterval(() => {
//       setState(prev => ({
//         ...prev,
//         activeConnections: prev.activeConnections + Math.floor(Math.random() * 5) - 2, // Fluctuate between -2 and +2
//       }));
//     }, 10000); // Update every 10 seconds

//     return () => clearInterval(interval);
//   }, []);

//   return {
//     ...state,
//     sendMessage,
//   };
// };


// src/hooks/useChat.ts
import { useState, useCallback, useEffect } from 'react';
import { Message, Chat, ChatState } from "../types";

const AGENT_RESPONSES = [
  "I understand. Could you tell me more about that?",
  "That's interesting! How can I help you with this?",
  "I see. Let me help you with that request.",
  "Thanks for sharing. Here's what I think...",
  "Great question! Based on my understanding...",
  "I appreciate your patience. Let me explain...",
  "That's a valid point. Here's what we can do...",
  "I'm here to help! What specific information do you need?",
];

// Load chats from localStorage
const loadChats = (): Chat[] => {
  const saved = localStorage.getItem('chats');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Convert date strings back to Date objects
      return parsed.map((chat: any) => ({
        ...chat,
        createdAt: new Date(chat.createdAt),
        updatedAt: new Date(chat.updatedAt),
        messages: chat.messages.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
      }));
    } catch (e) {
      console.error('Failed to load chats:', e);
    }
  }
  return [];
};

export const useChat = () => {
  const [state, setState] = useState<ChatState>(() => {
    const chats = loadChats();
    const currentChatId = chats.length > 0 ? chats[0].id : null;
    
    return {
      currentChatId,
      chats,
      activeConnections: Math.floor(Math.random() * 50) + 100,
      isTyping: false,
    };
  });

  // Save chats to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('chats', JSON.stringify(state.chats));
  }, [state.chats]);

  const currentChat = state.chats.find(chat => chat.id === state.currentChatId);

  const createNewChat = useCallback(() => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setState(prev => ({
      ...prev,
      chats: [newChat, ...prev.chats],
      currentChatId: newChat.id,
    }));
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
      const newCurrentId = prev.currentChatId === chatId
        ? (filtered.length > 0 ? filtered[0].id : null)
        : prev.currentChatId;

      return {
        ...prev,
        chats: filtered,
        currentChatId: newCurrentId,
      };
    });
  }, []);

  const updateChatTitle = useCallback((chatId: string, firstMessage: string) => {
    setState(prev => ({
      ...prev,
      chats: prev.chats.map(chat => 
        chat.id === chatId
          ? { 
              ...chat, 
              title: firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : ''),
              updatedAt: new Date()
            }
          : chat
      )
    }));
  }, []);

  const simulateAgentResponse = useCallback(async (chatId: string, userMessage: string) => {
    setState(prev => ({ ...prev, isTyping: true }));

    await new Promise(resolve => setTimeout(resolve, 1500));

    const randomResponse = AGENT_RESPONSES[Math.floor(Math.random() * AGENT_RESPONSES.length)];
    const agentMessage: Message = {
      id: (Date.now() + 1).toString(),
      text: `${randomResponse} Regarding "${userMessage.substring(0, 30)}..."`,
      sender: 'agent',
      timestamp: new Date(),
    };

    setState(prev => ({
      ...prev,
      chats: prev.chats.map(chat =>
        chat.id === chatId
          ? {
              ...chat,
              messages: [...chat.messages, agentMessage],
              updatedAt: new Date()
            }
          : chat
      ),
      isTyping: false,
    }));
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || !state.currentChatId) {
      // Create new chat if none exists
      if (!state.currentChatId) {
        createNewChat();
        setTimeout(() => sendMessage(text), 100); // Retry after chat is created
      }
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
    };

    // Update chat with user message
    setState(prev => {
      const updatedChats = prev.chats.map(chat =>
        chat.id === prev.currentChatId
          ? {
              ...chat,
              messages: [...chat.messages, userMessage],
              updatedAt: new Date()
            }
          : chat
      );

      // Update title if this is the first message
      const chat = updatedChats.find(c => c.id === prev.currentChatId);
      if (chat && chat.messages.length === 1) {
        updateChatTitle(prev.currentChatId!, text);
      }

      return {
        ...prev,
        chats: updatedChats,
      };
    });

    // Simulate AI response
    simulateAgentResponse(state.currentChatId, text);
  }, [state.currentChatId, createNewChat, simulateAgentResponse, updateChatTitle]);

  // Simulate active connections updating
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => ({
        ...prev,
        activeConnections: prev.activeConnections + Math.floor(Math.random() * 5) - 2,
      }));
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return {
    ...state,
    currentChat,
    createNewChat,
    selectChat,
    deleteChat,
    sendMessage,
  };
};