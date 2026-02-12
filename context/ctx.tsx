import { supabase } from '@/lib/supabase';
import { type Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

// Tells Supabase Auth to continuously refresh the session automatically if
// the app is in the foreground. When this is added, you will continue to receive
// `onAuthStateChange` events with the `TOKEN_REFRESHED` or `SIGNED_OUT` event
// if the user's session is terminated. This should only be registered once.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

WebBrowser.maybeCompleteAuthSession(); // Required for web

const AuthContext = createContext<{
  signIn: (provider: 'google' | 'apple') => Promise<void>;
  signOut: () => Promise<void>;
  session?: Session | null;
  isLoading: boolean;
}>({
  signIn: async () => {},
  signOut: async () => {},
  session: null,
  isLoading: true,
});

export function useSession() {
  const value = useContext(AuthContext);
  if (process.env.NODE_ENV !== 'production') {
    if (!value) {
      throw new Error('useSession must be wrapped in a <SessionProvider />');
    }
  }

  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (provider: 'google' | 'apple') => {
    try {
      const redirectUrl = Linking.createURL('/auth/callback'); 
      console.log('redirectUrl:', redirectUrl);
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No auth URL returned');

      console.log('Supabase Auth URL:', data.url);

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      console.log('WebBrowser result:', result);

      if (result.type === 'success' && result.url) {
        // Parse the URL to get the session key.
        // Usually Supabase redirects with #access_token=...&refresh_token=...
        // We need to parse this manually or let supabase handle it if we pass the URL??
        // Supabase v2 doesn't have a helper to parse URL string directly into session easily publicly exposed setup usually.
        // Actually, easiest way is to extract params.
        
        const { url } = result;
        const params = extractParamsFromUrl(url);

        if (params.access_token && params.refresh_token) {
           const { error } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
           });
           if (error) throw error;
        } else if (params.code) {
           const { error } = await supabase.auth.exchangeCodeForSession(params.code);
           if (error) throw error;
        }
      }
    } catch (e) {
      console.error('Sign in error:', e);
      // alert('Sign in failed');
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        signIn,
        signOut,
        session,
        isLoading,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

// Helper to extract params from URL hash or query
function extractParamsFromUrl(url: string) {
  const params: Record<string, string> = {};
  // Handle both # and ?
  const queryString = url.split('#')[1] || url.split('?')[1];
  if (!queryString) return params;

  const pairs = queryString.split('&');
  pairs.forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[key] = decodeURIComponent(value);
    }
  });
  return params;
}
