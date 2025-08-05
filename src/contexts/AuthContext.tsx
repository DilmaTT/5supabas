import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { importUserSettings } from '@/lib/data-manager';

// Define the Profile type
export interface Profile {
  id: string;
  username: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (email: string, password: string, username: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
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
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        // Fetch profile on auth state change
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        if (error && error.code !== 'PGRST116') { // 'PGRST116' is when no rows are found
          console.error('Error fetching profile:', error);
          setProfile(null);
        } else {
          setProfile(data);
        }
        
        // After profile is handled, sync user settings.
        // This is not awaited to prevent blocking UI updates.
        // The function handles its own notifications and reloads.
        importUserSettings();

      } else {
        // Clear profile on logout
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const register = async (email: string, password: string, username: string): Promise<{ success: boolean; message?: string }> => {
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      return { success: false, message: signUpError.message };
    }

    if (!authData.user) {
      return { success: false, message: "Registration successful, but no user data returned." };
    }

    // Insert profile after successful sign-up
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      username: username,
    });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      // NOTE: This is a simplified error handling. In a real app, you might want to
      // delete the auth user if profile creation fails, or use a DB trigger.
      return { success: false, message: `User created, but failed to create profile: ${profileError.message}` };
    }

    return { success: true };
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, message: error.message };
    }
    // Profile and settings will be fetched by the onAuthStateChange listener
    return { success: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    // Profile will be cleared by the onAuthStateChange listener
  };

  const value = {
    user,
    session,
    profile,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
