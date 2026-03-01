// src/types/voice.types.ts
export type Sender = 'user' | 'agent';

export interface VoiceMessage {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
  duration?: number; // Audio duration in seconds
}

export interface VoiceChat {
  id: string;
  title: string;
  messages: VoiceMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VoiceChatState {
  currentChatId: string | null;
  chats: VoiceChat[];
  activeConnections: number;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  currentTranscript: string;
}