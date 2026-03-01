// src/components/VoiceMessageBubble.tsx
import React, { useState } from 'react';
import { VoiceMessage } from '../types';
import { User, Bot, Volume2, Play, Pause } from 'lucide-react';

interface VoiceMessageBubbleProps {
  message: VoiceMessage;
  isLast?: boolean;
}

export const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({ 
  message, 
  isLast 
}) => {
  const isUser = message.sender === 'user';
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
    // Simulate playback
    if (!isPlaying) {
      setTimeout(() => setIsPlaying(false), 2000);
    }
  };

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-start gap-3 max-w-[80%] ${isUser ? 'flex-row-reverse' : ''}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
          ${isUser 
            ? 'bg-gradient-to-br from-blue-600 to-blue-700' 
            : 'bg-gradient-to-br from-purple-600 to-purple-700'
          } shadow-lg`}
        >
          {isUser ? (
            <User className="w-5 h-5 text-white" />
          ) : (
            <Bot className="w-5 h-5 text-white" />
          )}
        </div>

        {/* Message Content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Sender Name */}
          <span className="text-xs text-gray-500 mb-1 mx-1">
            {isUser ? 'You' : 'AI Assistant'}
          </span>

          {/* Message Bubble with Voice Controls */}
          <div className={`group relative px-4 py-3 rounded-2xl 
            ${isUser
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-br-none'
              : 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words pr-8">
              {message.text}
            </p>

            {/* Voice Control Button (for AI messages) */}
            {!isUser && (
              <button
                onClick={togglePlay}
                className="absolute right-2 bottom-2 p-1.5 rounded-full
                         bg-gray-700 hover:bg-gray-600 transition-colors
                         opacity-0 group-hover:opacity-100"
              >
                {isPlaying ? (
                  <Pause className="w-3 h-3 text-white" />
                ) : (
                  <Volume2 className="w-3 h-3 text-white" />
                )}
              </button>
            )}
          </div>

          {/* Message Footer */}
          <div className="flex items-center gap-2 mt-1 mx-1">
            <span className="text-xs text-gray-600">
              {message.timestamp.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
            
            {/* Voice Waveform for last AI message */}
            {!isUser && isLast && (
              <div className="flex items-center gap-0.5">
                {[2, 3, 4, 3, 2].map((h, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-purple-500 rounded-full animate-pulse"
                    style={{ 
                      height: `${h}px`,
                      animationDelay: `${i * 100}ms` 
                    }}
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