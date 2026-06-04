import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

const C = {
  bg:         '#0D0D0F',
  surface:    '#1C1C1E',
  border:     '#2C2C2E',
  orange:     '#FF6B00',
  textPrimary:   '#FFFFFF',
  textSecondary: '#8E8E93',
} as const;

export default function UsernameScreen() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('moto_username').then(res => {
      if (res) setUsername(res);
    });
  }, []);

  const handleSave = async () => {
    if (!username.trim()) {
      setErrorMsg('Please enter a username.');
      return;
    }
    
    setLoading(true);
    await SecureStore.setItemAsync('moto_username', username.trim());
    setLoading(false);

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.container}
      >
        <Text style={styles.title}>Choose a Username</Text>
        <Text style={styles.subtitle}>
          How should other riders identify you in the community maps?
        </Text>

        <View style={styles.form}>
          {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
          
          <TextInput
            style={styles.input}
            placeholder="Rider name"
            placeholderTextColor={C.textSecondary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            maxLength={20}
          />

          <Pressable 
            style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed, loading && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Start Riding</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: C.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 16,
    marginBottom: 32,
    lineHeight: 22,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    color: C.textPrimary,
    fontSize: 16,
  },
  btnPrimary: {
    backgroundColor: C.orange,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
  error: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
  }
});
