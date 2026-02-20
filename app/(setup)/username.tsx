import { Colors } from '@/constants/theme';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function getFormatError(value: string): string | null {
  if (value.length === 0) return null;
  if (value.length < 3) return 'Too short — minimum 3 characters';
  if (value.length > 20) return 'Too long — maximum 20 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Only letters, numbers, and underscores';
  return null;
}

export default function UsernameSetupScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { refreshProfile } = useProfile();

  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const formatError = getFormatError(value);
  const isValid = USERNAME_RE.test(value);
  const showFormatError = value.length > 0 && formatError !== null;

  const handleChange = (text: string) => {
    // Strip disallowed characters as the user types
    setValue(text.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20));
    setServerError(null);
  };

  const handleContinue = async () => {
    if (!isValid || isSaving) return;

    setIsSaving(true);
    setServerError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check uniqueness
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('username', value)
        .neq('id', user.id);

      if ((count ?? 0) > 0) {
        setServerError('That username is already taken');
        return;
      }

      // Save
      const { error } = await supabase
        .from('profiles')
        .update({ username: value })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      router.replace('/');
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  const displayedError = serverError ?? (showFormatError ? formatError : null);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5' }]}>
            <Text style={styles.iconEmoji}>🎮</Text>
          </View>

          {/* Heading */}
          <Text style={[styles.heading, { color: theme.onSurface }]}>Choose your username</Text>
          <Text style={[styles.subheading, { color: theme.onSurfaceVariant }]}>
            This is how other players will find and recognise you.
          </Text>

          {/* Input */}
          <View style={[
            styles.inputWrap,
            { backgroundColor: theme.surfaceVariant, borderColor: displayedError ? theme.error : 'transparent' },
          ]}>
            <Text style={[styles.atSign, { color: theme.onSurfaceVariant }]}>@</Text>
            <TextInput
              style={[styles.input, { color: theme.onSurface }]}
              value={value}
              onChangeText={handleChange}
              placeholder="your_username"
              placeholderTextColor={theme.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              maxLength={20}
            />
            {isValid && !isSaving && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </View>

          {/* Error / hint */}
          {displayedError ? (
            <Text style={[styles.hintText, { color: theme.error }]}>{displayedError}</Text>
          ) : (
            <Text style={[styles.hintText, { color: theme.onSurfaceVariant }]}>
              3–20 characters · letters, numbers, underscores
            </Text>
          )}

          {/* Button */}
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: isValid ? '#10B981' : theme.surfaceVariant },
            ]}
            onPress={handleContinue}
            disabled={!isValid || isSaving}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[styles.buttonText, { color: isValid ? '#FFFFFF' : theme.onSurfaceVariant }]}>
                Continue
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    paddingBottom: 48,
    gap: 16,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconEmoji: {
    fontSize: 36,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: -4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginTop: 8,
    gap: 6,
  },
  atSign: {
    fontSize: 18,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    paddingVertical: 0,
  },
  checkmark: {
    fontSize: 18,
    color: '#10B981',
    fontWeight: '700',
  },
  hintText: {
    fontSize: 13,
    marginTop: -4,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
