import { Colors } from '@/constants/theme';
import { useSession } from '@/context/ctx';
import { useProfile } from '@/context/profile-ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Convert an ISO 3166-1 alpha-2 code to its emoji flag (e.g. "US" → 🇺🇸). */
function countryFlag(code: string): string {
  return [...code.toUpperCase()].map(
    (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65),
  ).join('');
}

/** Return the English display name for an ISO country code (e.g. "US" → "United States"). */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function getFormatError(value: string): string | null {
  if (value.length === 0) return null;
  if (value.length < 3) return 'Too short — minimum 3 characters';
  if (value.length > 20) return 'Too long — maximum 20 characters';
  if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Only letters, numbers, and underscores';
  return null;
}

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { signOut } = useSession();
  const { profile, refreshProfile } = useProfile();

  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const regionCode = profile?.countryCode ?? null;
  const username = profile?.username ?? profile?.displayName ?? 'Player';

  const formatError = getFormatError(usernameValue);
  const isValid = USERNAME_RE.test(usernameValue);
  const showFormatError = usernameValue.length > 0 && formatError !== null;
  const displayedError = serverError ?? (showFormatError ? formatError : null);

  const handleStartEdit = () => {
    setUsernameValue(profile?.username ?? '');
    setServerError(null);
    setIsEditingUsername(true);
  };

  const handleCancelEdit = () => {
    setIsEditingUsername(false);
    setUsernameValue('');
    setServerError(null);
  };

  const handleUsernameChange = (text: string) => {
    setUsernameValue(text.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20));
    setServerError(null);
  };

  const handleSaveUsername = async () => {
    if (!isValid || isSaving || !profile?.id) return;

    setIsSaving(true);
    setServerError(null);

    try {
      // Check uniqueness
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('username', usernameValue)
        .neq('id', profile.id);

      if ((count ?? 0) > 0) {
        setServerError('That username is already taken');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ username: usernameValue })
        .eq('id', profile.id);

      if (error) throw error;

      await refreshProfile();
      setIsEditingUsername(false);
      setUsernameValue('');
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={theme.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.onSurface }]}>Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Avatar + greeting */}
          <View style={styles.heroSection}>
            <View style={[styles.avatarOuter, { borderColor: theme.surfaceVariant, shadowColor: '#000' }]}>
              <View style={styles.avatarInner}>
                {profile?.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarFallback, { backgroundColor: theme.primary }]}>
                    <Text style={styles.avatarText}>{username.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={[styles.welcomeLabel, { color: theme.primary }]}>WELCOME BACK</Text>
            <Text style={[styles.heroUsername, { color: theme.onSurface }]}>
              Hi, {username}
            </Text>

            <View style={[styles.bitsBadge, { backgroundColor: theme.surfaceVariant }]}>
              <MaterialIcons name="paid" size={16} color="#D4A017" />
              <Text style={[styles.bitsText, { color: theme.primary }]}>
                {(profile?.bits ?? 0).toLocaleString()} bits
              </Text>
            </View>
          </View>

          {/* Username section */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Username</Text>
            <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
              {isEditingUsername ? (
                <View style={styles.editBlock}>
                  <View style={[
                    styles.inputWrap,
                    { borderColor: displayedError ? theme.error : theme.surfaceDim },
                  ]}>
                    <Text style={[styles.atSign, { color: theme.onSurfaceVariant }]}>@</Text>
                    <TextInput
                      style={[styles.input, { color: theme.onSurface }]}
                      value={usernameValue}
                      onChangeText={handleUsernameChange}
                      placeholder="your_username"
                      placeholderTextColor={theme.onSurfaceVariant}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveUsername}
                      maxLength={20}
                    />
                    {isValid && !isSaving && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>

                  {displayedError ? (
                    <Text style={[styles.hintText, { color: theme.error }]}>{displayedError}</Text>
                  ) : (
                    <Text style={[styles.hintText, { color: theme.onSurfaceVariant }]}>
                      3–20 characters · letters, numbers, underscores
                    </Text>
                  )}

                  <View style={styles.editActions}>
                    <TouchableOpacity
                      style={[styles.editBtn, { backgroundColor: theme.surfaceDim }]}
                      onPress={handleCancelEdit}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.editBtnText, { color: theme.onSurfaceVariant }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editBtn, { backgroundColor: isValid ? '#10B981' : theme.surfaceDim }]}
                      onPress={handleSaveUsername}
                      disabled={!isValid || isSaving}
                      activeOpacity={0.75}
                    >
                      {isSaving ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={[styles.editBtnText, { color: isValid ? '#FFFFFF' : theme.onSurfaceVariant }]}>
                          Save
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.row}>
                  <MaterialIcons name="alternate-email" size={20} color={theme.onSurface} />
                  <Text style={[styles.rowLabel, { color: theme.onSurface }]}>
                    {profile?.username ?? 'Not set'}
                  </Text>
                  <TouchableOpacity onPress={handleStartEdit} hitSlop={8}>
                    <MaterialIcons name="edit" size={18} color={theme.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Region */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Region</Text>
            <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
              <View style={styles.row}>
                <MaterialIcons name="public" size={20} color={theme.onSurface} />
                <Text style={[styles.rowLabel, { color: theme.onSurface }]}>Region</Text>
                {regionCode ? (
                  <Text style={[styles.rowValue, { color: theme.onSurfaceVariant }]}>
                    {countryFlag(regionCode)}{'  '}{countryName(regionCode)}
                  </Text>
                ) : (
                  <Text style={[styles.rowValue, { color: theme.onSurfaceVariant }]}>Not detected</Text>
                )}
              </View>
            </View>
          </View>

          {/* Account */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Account</Text>
            <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
              <TouchableOpacity style={styles.row} onPress={handleSignOut} activeOpacity={0.75}>
                <MaterialIcons name="logout" size={20} color={theme.error} />
                <Text style={[styles.rowLabel, { color: theme.error }]}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  avatarOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 36,
  },
  welcomeLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  heroUsername: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  bitsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    gap: 6,
    marginTop: 4,
  },
  bitsText: {
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 24,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '400',
  },
  editBlock: {
    padding: 16,
    gap: 10,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 6,
  },
  atSign: {
    fontSize: 17,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    paddingVertical: 0,
  },
  checkmark: {
    fontSize: 17,
    color: '#10B981',
    fontWeight: '700',
  },
  hintText: {
    fontSize: 12,
    marginLeft: 2,
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
