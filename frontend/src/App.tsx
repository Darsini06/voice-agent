// src/App.tsx
import React from 'react';
import { VoiceSidebar } from './components/VoiceSidebar';
import { VoiceChatInterface } from './components/VoiceChatInterface';
import { useVoiceWebSocket } from './hooks/useVoiceWebSocket';  // ← Change this!
import { Wifi, WifiOff, Mic } from 'lucide-react';

function App() {
  const {
    chats,
    currentChat,
    currentChatId,
    isListening,
    isSpeaking,
    isProcessing,
    currentTranscript,
    isConnected,
    audioLevel,          // FIX: now exposed by hook
    createNewChat,
    selectChat,
    deleteChat,
    startListening,
    stopListening
  } = useVoiceWebSocket();
  return (
    <div className="flex h-screen bg-gray-950">
      {/* Connection Status */}
      <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 
                      rounded-full ${isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
        {isConnected ? (
          <>
            <Wifi className="w-4 h-4" />
            <span className="text-sm">Connected</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            <span className="text-sm">Reconnecting...</span>
          </>
        )}
      </div>

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
            activeConnections={Math.floor(Math.random() * 50) + 100}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing}
            isConnected={isConnected}     // FIX: was missing — disconnected banner never showed
            audioLevel={audioLevel}       // FIX: was missing — visualizer was always flat
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
                {isConnected ? 'Start a new voice conversation' : 'Connecting to server...'}
              </p>
              <button
                onClick={createNewChat}
                disabled={!isConnected}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 
                         text-white rounded-lg hover:from-blue-700 hover:to-purple-700
                         transition-all duration-200 shadow-lg shadow-blue-600/20
                         disabled:opacity-50 disabled:cursor-not-allowed"
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