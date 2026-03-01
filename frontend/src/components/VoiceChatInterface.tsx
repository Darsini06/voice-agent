// src/components/VoiceChatInterface.tsx
import React, { useRef, useEffect, useState } from 'react';
import { Message } from '../types';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { 
  Mic, 
  Square, 
  Waves, 
  Volume2,
  Users,
  Brain,
  Sparkles
} from 'lucide-react';

interface VoiceChatInterfaceProps {
  messages: Message[];
  currentChatTitle: string;
  activeConnections: number;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  currentTranscript: string;
  onStartListening: () => void;
  onStopListening: () => void;
}

export const VoiceChatInterface: React.FC<VoiceChatInterfaceProps> = ({
  messages,
  currentChatTitle,
  activeConnections,
  isListening,
  isSpeaking,
  isProcessing,
  currentTranscript,
  onStartListening,
  onStopListening,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Simulate audio levels when listening
  useEffect(() => {
    if (isListening) {
      const interval = setInterval(() => {
        setAudioLevel(20 + Math.random() * 60);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setAudioLevel(0);
    }
  }, [isListening]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTranscript]);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-gray-900 to-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 
                       border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 
                          rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">
                {currentChatTitle}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Brain className="w-3 h-3 text-gray-500" />
                <span className="text-xs text-gray-500">Voice Assistant</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Status Indicators */}
          {isSpeaking && (
            <div className="flex items-center gap-2 px-3 py-1.5 
                          bg-green-500/10 rounded-full border border-green-500/20">
              <Volume2 className="w-4 h-4 text-green-400 animate-pulse" />
              <span className="text-xs text-green-400">Speaking</span>
            </div>
          )}
          
          {isProcessing && (
            <div className="flex items-center gap-2 px-3 py-1.5 
                          bg-blue-500/10 rounded-full border border-blue-500/20">
              <Brain className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-xs text-blue-400">Thinking</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 
                        bg-gray-800 rounded-full border border-gray-700">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">{activeConnections}</span>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh]">
              <div className="w-24 h-24 bg-gradient-to-r from-blue-600 to-purple-600 
                            rounded-full flex items-center justify-center mb-6
                            shadow-xl shadow-blue-600/20">
                <Mic className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Voice Chat Assistant
              </h2>
              <p className="text-gray-400 text-center max-w-md mb-8">
                Click the microphone button and start speaking. 
                I'll listen, understand, and respond to your voice.
              </p>
              <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-gray-700 rounded-full animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <VoiceMessageBubble 
                key={message.id} 
                message={message}
                isLast={index === messages.length - 1}
              />
            ))
          )}

          {/* Live Transcript */}
          {isListening && currentTranscript && (
            <div className="flex items-start gap-3 opacity-70">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full 
                            flex items-center justify-center animate-pulse">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <div className="bg-gray-800/50 backdrop-blur-sm px-4 py-3 
                            rounded-2xl rounded-bl-none border border-gray-700">
                <p className="text-gray-300 italic">{currentTranscript}</p>
                <div className="flex gap-1 mt-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" 
                       style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" 
                       style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Voice Control Bar */}
      <div className="border-t border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col items-center gap-4">
            
            {/* Audio Visualizer */}
            {isListening && (
              <div className="w-full max-w-md">
                <div className="flex items-center justify-center gap-[2px] h-16">
                  {[...Array(32)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-blue-500 to-purple-500 
                               rounded-full transition-all duration-100"
                      style={{
                        height: `${Math.max(4, audioLevel * (0.3 + Math.sin(i * 0.3 + Date.now() * 0.01) * 0.2))}%`,
                      }}
                    />
                  ))}
                </div>
                <p className="text-center text-sm text-gray-400 mt-2">
                  Listening... I can hear you
                </p>
              </div>
            )}

            {/* Main Voice Button */}
            <button
              onClick={isListening ? onStopListening : onStartListening}
              disabled={isProcessing || isSpeaking}
              className={`relative group transition-all duration-300 
                        ${isListening ? 'scale-110' : 'hover:scale-105'}
                        ${(isProcessing || isSpeaking) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`w-24 h-24 rounded-full flex items-center justify-center 
                            transition-all duration-300 shadow-xl
                            ${isListening 
                              ? 'bg-red-500 shadow-red-500/50' 
                              : 'bg-gradient-to-r from-blue-600 to-purple-600 shadow-blue-600/30'
                            }`}>
                {isListening ? (
                  <Square className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </div>
              
              {/* Ripple Effects */}
              {isListening && (
                <>
                  <div className="absolute inset-0 rounded-full bg-red-500 
                                animate-ping opacity-20" />
                  <div className="absolute -inset-4 rounded-full bg-red-500/10 
                                animate-pulse" />
                  <div className="absolute -inset-8 rounded-full bg-red-500/5 
                                animate-pulse" style={{ animationDelay: '500ms' }} />
                </>
              )}
            </button>

            {/* Status Text */}
            <div className="text-center">
              {isListening ? (
                <p className="text-red-400 font-medium">Recording... Click square to stop</p>
              ) : isSpeaking ? (
                <p className="text-green-400 font-medium">Speaking response...</p>
              ) : isProcessing ? (
                <p className="text-blue-400 font-medium">Processing your request...</p>
              ) : (
                <p className="text-gray-400">Click the microphone to start speaking</p>
              )}
            </div>

            {/* Waveform Hint */}
            {!isListening && !isSpeaking && !isProcessing && messages.length > 0 && (
              <div className="flex gap-1 mt-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-1 bg-gray-700 rounded-full"
                    style={{ height: `${4 + i * 2}px` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};