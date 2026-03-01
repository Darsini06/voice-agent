
export type Sender = 'user' | 'agent';

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatState {
  currentChatId: string | null;
  chats: Chat[];
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  currentTranscript: string;
  isConnected: boolean;
}