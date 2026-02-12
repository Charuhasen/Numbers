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
  isSigningIn: boolean;
  signInError: string | null;
}>({
  signIn: async () => {},
  signOut: async () => {},
  session: null,
  isLoading: true,
  isSigningIn: false,
  signInError: null,
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
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

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
    if (isSigningIn) return;
    setIsSigningIn(true);
    setSignInError(null);

    try {
      const redirectUrl = Linking.createURL('/auth/callback');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No auth URL returned');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
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
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User cancelled — not an error, just reset
        setIsSigningIn(false);
        return;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign in failed. Please try again.';
      setSignInError(message);
    } finally {
      setIsSigningIn(false);
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
        isSigningIn,
        signInError,
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
