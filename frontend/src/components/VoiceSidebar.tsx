// src/components/VoiceSidebar.tsx
import React, { useState } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  Mic, 
  Clock,
  Search,
  Menu,
  X
} from 'lucide-react';

interface VoiceSidebarProps {
  chats: Array<{
    id: string;
    title: string;
    messages: any[];
    updatedAt: Date;
  }>;
  currentChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
}

export const VoiceSidebar: React.FC<VoiceSidebarProps> = ({
  chats,
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredChats = chats.filter(chat =>
    chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header with New Chat Button */}
      <div className="p-4 border-b border-gray-800">
        <button
          onClick={() => {
            onNewChat();
            setIsMobileOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 
                     bg-gradient-to-r from-blue-600 to-purple-600 
                     hover:from-blue-700 hover:to-purple-700
                     text-white rounded-xl transition-all duration-200
                     shadow-lg shadow-blue-600/20"
        >
          <Mic className="w-5 h-5" />
          <span className="font-medium">New Voice Chat</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-800 text-gray-200 pl-10 pr-4 py-2 
                       rounded-lg border border-gray-700 focus:border-blue-500 
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto px-2">
        {filteredChats.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No conversations yet</p>
            <p className="text-gray-600 text-xs mt-1">Start a new voice chat</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredChats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => {
                  onSelectChat(chat.id);
                  setIsMobileOpen(false);
                }}
                className={`group relative flex items-center gap-3 px-3 py-3 
                           rounded-lg cursor-pointer transition-all duration-200
                           ${currentChatId === chat.id 
                             ? 'bg-gray-800 shadow-lg' 
                             : 'hover:bg-gray-800/50'
                           }`}
              >
                {/* Icon */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full 
                              flex items-center justify-center
                              ${currentChatId === chat.id 
                                ? 'bg-blue-600' 
                                : 'bg-gray-700 group-hover:bg-gray-600'
                              }`}>
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>

                {/* Chat Info */}
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-medium truncate
                                ${currentChatId === chat.id 
                                  ? 'text-white' 
                                  : 'text-gray-300'
                                }`}>
                    {chat.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span className="text-xs text-gray-500">
                      {formatDate(chat.updatedAt)}
                    </span>
                    <span className="text-xs text-gray-600">
                      • {chat.messages.length} messages
                    </span>
                  </div>
                </div>

                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 
                           hover:bg-red-500/10 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4 text-gray-500 hover:text-red-500" />
                </button>

                {/* Active Indicator */}
                {currentChatId === chat.id && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 
                                bg-blue-500 rounded-r-full" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 
                        rounded-full flex items-center justify-center">
            <span className="text-white font-semibold">U</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Voice User</p>
            <p className="text-xs text-gray-500">Online • Voice Mode</p>
          </div>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800 
                   rounded-lg border border-gray-700"
      >
        {isMobileOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <Menu className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Sidebar - Desktop */}
      <div className="hidden lg:block w-80 h-screen">
        <SidebarContent />
      </div>

      {/* Sidebar - Mobile */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-80 h-full">
            <SidebarContent />
          </div>
          <div 
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />
        </div>
      )}
    </>
  );
};