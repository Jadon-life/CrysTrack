'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isRestrictedPreview, previewMode } from '@/lib/preview/mode';
import { DEMO_USER } from '@/lib/preview/data';
import { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => null,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = React.useMemo(() => isRestrictedPreview() ? null : createClient(), []);

  const refreshUser = React.useCallback(async () => {
    if (!supabase) {
      const demoUser = previewMode() === 'preview-demo' ? DEMO_USER as User : null;
      setUser(demoUser);
      return demoUser;
    }
    try {
      const {
        data: { user: refreshedUser },
        error,
      } = await supabase.auth.getUser();

      if (error) {
        console.error('Auth refresh failed:', error);
        return null;
      }

      setUser(refreshedUser ?? null);
      return refreshedUser ?? null;
    } catch (error) {
      console.error('Auth refresh failed:', error);
      return null;
    }
  }, [supabase]);

  useEffect(() => {
    const initialize = async () => {
      try {
        await refreshUser();
      } finally {
        setLoading(false);
      }
    };

    void initialize();

    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, [refreshUser, supabase]);

  const signOut = async () => {
    if (!supabase) return; // No real session exists in the synthetic demo.
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
