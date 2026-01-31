'use client';

import { useState, useEffect } from 'react';
import { getAdminToken, setAdminToken } from '@/lib/adminApi';

export default function AdminTokenGate({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [inputToken, setInputToken] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    setToken(getAdminToken());
    setIsLoading(false);
  }, []);
  
  const handleSaveToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputToken.trim()) {
      setAdminToken(inputToken.trim());
      setToken(inputToken.trim());
      setInputToken('');
    }
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }
  
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold mb-4">Admin Access</h1>
          <p className="text-gray-600 mb-6">
            Enter your admin token to access the admin console.
          </p>
          <form onSubmit={handleSaveToken}>
            <input
              type="password"
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              placeholder="Admin token"
              className="w-full px-4 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Save Token
            </button>
          </form>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}
