// src/components/ActiveConnections.tsx
import React from 'react';
import { Users } from 'lucide-react';

interface ActiveConnectionsProps {
  count: number;
}

export const ActiveConnections: React.FC<ActiveConnectionsProps> = ({ count }) => {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-full">
      <Users className="w-4 h-4 text-green-400" />
      <span className="text-sm font-medium text-gray-200">
        {count.toLocaleString()} active connections
      </span>
      <div className="flex space-x-1 ml-2">
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse delay-75" />
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse delay-150" />
      </div>
    </div>
  );
};