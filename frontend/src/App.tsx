// src/App.tsx
import React from 'react';
import { VoiceSidebar } from './components/VoiceSidebar';
import { VoiceChatInterface } from './components/VoiceChatInterface';
import { useVoiceChatHistory } from './hooks/useVoiceChatHistory';
import { Mic } from 'lucide-react';
function App() {
  const {
    chats,
    currentChatId,
    currentChat,
    activeConnections,
    isListening,
    isSpeaking,
    isProcessing,
    currentTranscript,
    createNewChat,
    selectChat,
    deleteChat,
    startListening,
    stopListening,
  } = useVoiceChatHistory();

  return (
    <div className="flex h-screen bg-gray-950">
      <VoiceSidebar
        chats={chats}
        currentChatId={currentChatId}
        onNewChat={createNewChat}
        onSelectChat={selectChat}
        onDeleteChat={deleteChat}
      />
      
      <div className="flex-1">
        {currentChat ? (
          <VoiceChatInterface
            messages={currentChat.messages}
            currentChatTitle={currentChat.title}
            activeConnections={activeConnections}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing}
            currentTranscript={currentTranscript}
            onStartListening={startListening}
            onStopListening={stopListening}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-purple-600 
                            rounded-full flex items-center justify-center mx-auto mb-4">
                <Mic className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Welcome to Voice Assistant
              </h2>
              <p className="text-gray-400 mb-6">
                Start a new voice conversation
              </p>
              <button
                onClick={createNewChat}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 
                         text-white rounded-lg hover:from-blue-700 hover:to-purple-700
                         transition-all duration-200 shadow-lg shadow-blue-600/20"
              >
                New Voice Chat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;