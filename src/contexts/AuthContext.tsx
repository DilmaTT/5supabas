import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Session } from '@supabase/supabase-js';
import { loadDataFromSupabase, syncDataToSupabase, clearLocalData } from '@/lib/data-manager';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email! });
      }
      setLoading(false);
    };
    
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session: Session | null) => {
        if (session?.user) {
          const currentUser = { id: session.user.id, email: session.user.email! };
          setUser(currentUser);
          if (_event === 'SIGNED_IN') {
            await loadDataFromSupabase();
          }
        } else {
          setUser(null);
          if (_event === 'SIGNED_OUT') {
            clearLocalData();
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const register = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return { success: false, message: 'Ошибка регистрации: ' + error.message };
    }
    if (data.user) {
      // Create an initial empty record in Supabase for the new user
      await syncDataToSupabase(false); // Don't show alert on initial sync
    }
    return { success: true };
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, message: 'Ошибка входа: ' + error.message };
    }
    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    // The onAuthStateChange listener will handle clearing data and state
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        loading,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};
