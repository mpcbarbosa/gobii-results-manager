'use client';

import { useState, useEffect } from 'react';
import { adminFetch, type UserItem } from '@/lib/adminApi';

const STORAGE_KEY = 'gobii.myUserId';
const SYSTEM_EMAIL = 'system@gobii.internal';

export function getMyUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setMyUserId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, id);
}

interface Props {
  onChange?: (userId: string) => void;
}

export default function UserIdentitySelector({ onChange }: Props) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await adminFetch<{ items: UserItem[] }>('/api/admin/users');
      setUsers(res.items);

      // Determine initial selection
      const stored = getMyUserId();
      const nonSystem = res.items.filter((u) => u.email !== SYSTEM_EMAIL);
      const fallback = nonSystem.length > 0 ? nonSystem[0] : res.items[0];

      if (stored && res.items.some((u) => u.id === stored)) {
        setSelectedId(stored);
      } else if (fallback) {
        setSelectedId(fallback.id);
        setMyUserId(fallback.id);
        onChange?.(fallback.id);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (id: string) => {
    setSelectedId(id);
    setMyUserId(id);
    onChange?.(id);
  };

  if (loading || users.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">👤 I am:</span>
      <select
        value={selectedId}
        onChange={(e) => handleChange(e.target.value)}
        className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
      >
        {users
          .filter((u) => u.email !== SYSTEM_EMAIL)
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
      </select>
    </div>
  );
}
