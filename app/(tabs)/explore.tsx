import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { desc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { trips, type Trip } from '@/db/schema';
import { seedTestRide } from '@/lib/seedTestData';

const C = {
  bg:            '#0D0D0F',
  surface:       '#1C1C1E',
  border:        '#2C2C2E',
  orange:        '#FF6B00',
  textPrimary:   '#FFFFFF',
  textSecondary: '#8E8E93',
  textDim:       '#48484A',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function formatDuration(startMs: number, endMs: number | null): string {
  if (!endMs) return 'In progress';
  const totalSec = Math.floor((endMs - startMs) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDist(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

// ── Trip row ──────────────────────────────────────────────────────────────────

function TripRow({ trip, onPress, onLongPress }: { trip: Trip; onPress: () => void; onLongPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowDate}>{formatDate(trip.date)}</Text>
        <Text style={styles.rowMeta}>
          {formatDist(trip.totalDist)}
          {'  ·  '}
          {formatDuration(trip.startTime, trip.endTime ?? null)}
        </Text>
      </View>
      <Text style={styles.rowTime}>{formatTime(trip.date)}</Text>
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const router = useRouter();
  const [rideHistory, setRideHistory] = useState<Trip[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await getDb()
        .select()
        .from(trips)
        .orderBy(desc(trips.date));
      setRideHistory(rows);
    } catch (err) {
      console.error('[History] query failed:', err);
    }
  }, []);

  // Refresh every time the tab becomes active.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    try {
      await seedTestRide();
      await load();
    } finally {
      setSeeding(false);
    }
  }, [load]);

  const confirmDelete = useCallback(async () => {
    if (deleteTargetId === null) return;
    await getDb().delete(trips).where(eq(trips.id, deleteTargetId));
    setDeleteTargetId(null);
    await load();
  }, [deleteTargetId, load]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerRow}> 
          <Text style={styles.title}>Ride History</Text>
          {/* <Pressable
            style={({ pressed }) => [styles.seedBtn, pressed && { opacity: 0.6 }]}
            onPress={handleSeed}
            disabled={seeding}
          >
            <Text style={styles.seedBtnText}>{seeding ? '…' : '+ Test ride'}</Text>
          </Pressable> */}
        </View>
        <Text style={styles.subtitle}>
          {rideHistory.length === 0 ? 'No rides yet' : `${rideHistory.length} ride${rideHistory.length !== 1 ? 's' : ''}`}
        </Text>
      </View>

      {rideHistory.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏍</Text>
          <Text style={styles.emptyText}>Start your first ride to see it here.</Text>
        </View>
      ) : (
        <FlatList
          data={rideHistory}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TripRow
              trip={item}
              onPress={() => router.push({ pathname: '/trip/[id]', params: { id: item.id } })}
              onLongPress={() => setDeleteTargetId(item.id)}
            />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* ── Delete confirmation modal ── */}
      <Modal
        visible={deleteTargetId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTargetId(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDeleteTargetId(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Delete ride?</Text>
            <Text style={styles.modalBody}>
              This will permanently remove the ride and all its GPS data.
            </Text>
            <View style={styles.modalDivider} />
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.6 }]}
                onPress={() => setDeleteTargetId(null)}
              >
                <Text style={styles.modalBtnCancel}>Cancel</Text>
              </Pressable>
              <View style={styles.modalBtnDivider} />
              <Pressable
                style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.6 }]}
                onPress={confirmDelete}
              >
                <Text style={styles.modalBtnDelete}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seedBtn: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  seedBtnText: {
    color: C.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  title: {
    color: C.textPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 14,
  },

  list: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  row: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeft: {
    gap: 4,
  },
  rowDate: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    color: C.textSecondary,
    fontSize: 13,
  },
  rowTime: {
    color: C.textDim,
    fontSize: 13,
  },
  separator: {
    height: 10,
  },

  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 80,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    color: C.textSecondary,
    fontSize: 15,
  },

  // Delete modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  modalTitle: {
    color: C.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 6,
  },
  modalBody: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
    lineHeight: 20,
  },
  modalDivider: {
    height: 1,
    backgroundColor: C.border,
  },
  modalActions: {
    flexDirection: 'row',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalBtnDivider: {
    width: 1,
    backgroundColor: C.border,
  },
  modalBtnCancel: {
    color: C.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  modalBtnDelete: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
