import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useFocusEffect, router } from 'expo-router';
import { useCallback } from 'react';

const C = {
  bg:         '#0D0D0F',
  surface:    '#1C1C1E',
  border:     '#2C2C2E',
  orange:     '#FF6B00',
  textPrimary:   '#FFFFFF',
  textSecondary: '#8E8E93',
} as const;

export default function CommunityScreen() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPublicRoutes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setRoutes(data || []);
    } catch (err) {
      console.error('Error fetching public routes:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchPublicRoutes();
    }, [])
  );

  const renderItem = ({ item }: { item: any }) => (
    <Pressable 
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      onPress={() => router.push(`/cloud-trip/${item.id}`)}
    >
      <Text style={styles.title}>@{item.username}</Text>
      <Text style={styles.subtitle}>Distance {(item.total_dist / 1000).toFixed(2)} km</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community Routes</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.orange} />
        </View>
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No public routes found.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { color: C.textPrimary, fontSize: 24, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: C.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  title: { color: C.orange, fontSize: 16, fontWeight: '700' },
  subtitle: { color: C.textSecondary, fontSize: 14, marginTop: 4 },
  emptyText: { color: C.textSecondary, textAlign: 'center', marginTop: 40 },
});
