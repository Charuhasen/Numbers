import { Colors, Spacing, Typography } from '@/constants/theme';
import { useSession } from '@/context/ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const { signIn, isSigningIn, signInError } = useSession();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Top Section: Logo & Tagline */}
      <View style={styles.topSection}>
        <Text style={[styles.title, { color: theme.onSurface }]}>TAP TAP MATH</Text>
        <Text style={[styles.tagline, { color: theme.onSurfaceVariant }]}>Challenge your mind.</Text>
      </View>

      {/* Bottom Section: Auth Buttons */}
      <View style={styles.bottomSection}>
        {signInError && (
          <Text style={[styles.errorText, { color: theme.error }]}>{signInError}</Text>
        )}

        {/* Apple Sign In */}
        <TouchableOpacity
          style={[styles.button, styles.appleButton, isSigningIn && styles.buttonDisabled]}
          activeOpacity={0.8}
          onPress={() => signIn('apple')}
          disabled={isSigningIn}
        >
          {isSigningIn ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="logo-apple" size={20} color="#FFFFFF" style={styles.buttonIcon} />
              <Text style={styles.appleButtonText}>Continue with Apple</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Google Sign In */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.surfaceVariant }, isSigningIn && styles.buttonDisabled]}
          activeOpacity={0.8}
          onPress={() => signIn('google')}
          disabled={isSigningIn}
        >
          {isSigningIn ? (
            <ActivityIndicator color={theme.onSurface} size="small" />
          ) : (
            <Text style={[styles.buttonText, { color: theme.onSurface }]}>
              <Text style={{ fontWeight: 'bold' }}>G  </Text>
              Continue with Google
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topSection: {
    flex: 0.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomSection: {
    flex: 0.4,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    ...Typography.headlineLarge,
    letterSpacing: 2,
    marginBottom: 8,
    textAlign: 'center',
  },
  tagline: {
    ...Typography.bodyLarge,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  button: {
    height: 56,
    borderRadius: Spacing.buttonRadius,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonIcon: {
    marginRight: 8,
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
