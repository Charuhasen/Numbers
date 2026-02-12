import { Colors, Spacing, Typography } from '@/constants/theme';
import { useSession } from '@/context/ctx';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const { signIn } = useSession();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.surface }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      
      {/* Top Section: Logo & Tagline */}
      <View style={styles.topSection}>
        <Text style={[styles.title, { color: theme.onSurface }]}>NUMBERS GAME</Text>
        <Text style={[styles.tagline, { color: theme.onSurfaceVariant }]}>Challenge your mind.</Text>
      </View>

      {/* Bottom Section: Auth Buttons */}
      <View style={styles.bottomSection}>
        {/* Apple Sign In */}
        <TouchableOpacity 
          style={[styles.button, styles.appleButton]}
          activeOpacity={0.8}
          onPress={() => signIn('apple')}
        >
          <Text style={styles.appleButtonText}>Continue with Apple</Text>
        </TouchableOpacity>

        {/* Google Sign In */}
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: theme.surfaceVariant }]}
          activeOpacity={0.8}
          onPress={() => signIn('google')}
        >
          {/* Minimal G text for now, ideally an icon */}
          <Text style={[styles.buttonText, { color: theme.onSurface }]}>
            <Text style={{ fontWeight: 'bold' }}>G  </Text>
            Continue with Google
          </Text>
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
    gap: 12, // Gap between buttons
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
  button: {
    height: 56,
    borderRadius: Spacing.buttonRadius,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
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
