import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

// Side-effect import: registers REGISTERED_TRACKING_TASK with TaskManager.
// defineTask() is a pure JS call with no native I/O, so it is safe at
// module-eval time.
import '../lib/trackingTask';

import { initDatabase } from '../db/client';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // initDatabase() opens the SQLite file and runs PRAGMAs + DDL.
      // It must run inside a lifecycle method, not at module scope, so that
      // the expo-sqlite native module is fully initialised first.
      initDatabase();
      setDbReady(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MotoTrack] initDatabase failed:', msg);
      setDbError(msg);
    }
  }, []);

  if (dbError) {
    // Render the raw error so it appears on-screen AND in Metro logs.
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#1a0000' }}>
        <Text style={{ color: '#ff6b6b', fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
          DB init failed
        </Text>
        <Text style={{ color: '#ffcccc', fontSize: 13, fontFamily: 'monospace' }}>
          {dbError}
        </Text>
      </View>
    );
  }

  if (!dbReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen
            name="trip/[id]"
            options={{
              headerShown: true,
              title: 'Trip Map',
              headerStyle: { backgroundColor: '#0D0D0F' },
              headerTintColor: '#FFFFFF',
              headerTitleStyle: { fontWeight: '600' },
              headerBackTitle: 'History',
            }}
          />
          <Stack.Screen
            name="cloud-trip/[id]"
            options={{
              headerShown: true,
              title: 'Community Map',
              headerStyle: { backgroundColor: '#0D0D0F' },
              headerTintColor: '#FFFFFF',
              headerTitleStyle: { fontWeight: '600' },
              headerBackTitle: 'Back',
            }}
          />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
