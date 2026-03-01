// src/components/ChatInput.tsx
import React, { useState } from 'react';
import { Send, Paperclip } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, disabled }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 p-4 border-t border-gray-800">
      <button
        type="button"
        className="p-2 text-gray-400 hover:text-gray-300 transition-colors rounded-lg hover:bg-gray-800"
        disabled={disabled}
      >
        <Paperclip className="w-5 h-5" />
      </button>
      
      <div className="flex-1 relative">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message..."
          rows={1}
          disabled={disabled}
          className="w-full resize-none bg-gray-800 text-gray-100 rounded-lg pl-4 pr-12 py-3 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700
                     placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: '44px', maxHeight: '120px' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
      </div>

      <button
        type="submit"
        disabled={!message.trim() || disabled}
        className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
      >
        <Send className="w-5 h-5" />
      </button>
    </form>
  );
};