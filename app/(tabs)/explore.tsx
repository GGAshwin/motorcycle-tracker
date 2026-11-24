import { desc, eq } from "drizzle-orm";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppCard } from "@/components/ui/app-card";
import { StatusChip } from "@/components/ui/status-chip";
import { DS, paletteForScheme } from "@/constants/design-system";
import { getDb } from "@/db/client";
import { trips, type Trip } from "@/db/schema";
import { useColorScheme } from "@/hooks/use-color-scheme";

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(startMs: number, endMs: number | null): string {
  if (!endMs) return "In progress";
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

function TripRow({
  trip,
  onPress,
  onLongPress,
  palette,
}: {
  trip: Trip;
  onPress: () => void;
  onLongPress: () => void;
  palette: ReturnType<typeof paletteForScheme>;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      {({ pressed }) => (
        <AppCard style={[styles.rowCard, pressed && { opacity: 0.8 }]}>
          <View style={styles.rowTop}>
            <Text style={[styles.rowDate, { color: palette.textPrimary }]}>
              {formatDate(trip.date)}
            </Text>
            <Text style={[styles.rowTime, { color: palette.textMuted }]}>
              {formatTime(trip.date)}
            </Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={[styles.rowMeta, { color: palette.textSecondary }]}>
              {formatDist(trip.totalDist)} |{" "}
              {formatDuration(trip.startTime, trip.endTime ?? null)}
            </Text>
            <StatusChip
              label={trip.endTime ? "DONE" : "ACTIVE"}
              tone={trip.endTime ? "brand" : "warning"}
            />
          </View>
        </AppCard>
      )}
    </Pressable>
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const palette = paletteForScheme(useColorScheme());
  const [rideHistory, setRideHistory] = useState<Trip[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await getDb().select().from(trips).orderBy(desc(trips.date));
      setRideHistory(rows);
    } catch (err) {
      console.error("[History] query failed:", err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const confirmDelete = useCallback(async () => {
    if (deleteTargetId === null) return;
    await getDb().delete(trips).where(eq(trips.id, deleteTargetId));
    setDeleteTargetId(null);
    await load();
  }, [deleteTargetId, load]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          Ride History
        </Text>
        <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
          {rideHistory.length === 0
            ? "No rides yet"
            : `${rideHistory.length} ride${rideHistory.length !== 1 ? "s" : ""}`}
        </Text>
      </View>

      {rideHistory.length === 0 ? (
        <View style={styles.emptyWrap}>
          <AppCard style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
              No rides recorded
            </Text>
            <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
              Start your first ride to fill this timeline.
            </Text>
          </AppCard>
        </View>
      ) : (
        <FlatList
          data={rideHistory}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TripRow
              trip={item}
              onPress={() =>
                router.push({ pathname: "/trip/[id]", params: { id: item.id } })
              }
              onLongPress={() => setDeleteTargetId(item.id)}
              palette={palette}
            />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => (
            <View style={{ height: DS.spacing.sm }} />
          )}
        />
      )}

      <Modal
        visible={deleteTargetId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTargetId(null)}
      >
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: palette.overlay }]}
          onPress={() => setDeleteTargetId(null)}
        >
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>
              Delete ride?
            </Text>
            <Text style={[styles.modalBody, { color: palette.textSecondary }]}>
              This will permanently remove the ride and all GPS points.
            </Text>
            <View
              style={[styles.modalDivider, { backgroundColor: palette.border }]}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalBtn}
                onPress={() => setDeleteTargetId(null)}
              >
                <Text
                  style={[
                    styles.modalBtnCancel,
                    { color: palette.textSecondary },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
              <View
                style={[
                  styles.modalBtnDivider,
                  { backgroundColor: palette.border },
                ]}
              />
              <Pressable style={styles.modalBtn} onPress={confirmDelete}>
                <Text style={[styles.modalBtnDelete, { color: palette.error }]}>
                  Delete
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: DS.spacing.lg,
    paddingTop: DS.spacing.sm,
    paddingBottom: DS.spacing.md,
  },
  title: {
    ...DS.type.title,
  },
  subtitle: {
    ...DS.type.body,
    marginTop: DS.spacing.xxs,
  },
  list: {
    paddingHorizontal: DS.spacing.lg,
    paddingBottom: DS.spacing.xl,
  },
  rowCard: {
    paddingVertical: DS.spacing.sm,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: DS.spacing.xs,
  },
  rowDate: {
    ...DS.type.subtitle,
    fontSize: 17,
  },
  rowTime: {
    ...DS.type.caption,
  },
  rowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: DS.spacing.sm,
  },
  rowMeta: {
    ...DS.type.body,
    fontSize: 14,
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: DS.spacing.lg,
  },
  emptyCard: {
    width: "100%",
    alignItems: "center",
    gap: DS.spacing.xs,
  },
  emptyTitle: {
    ...DS.type.subtitle,
  },
  emptyText: {
    ...DS.type.body,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: DS.spacing.lg,
  },
  modalCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: DS.radius.lg,
    overflow: "hidden",
  },
  modalTitle: {
    ...DS.type.subtitle,
    textAlign: "center",
    paddingTop: DS.spacing.lg,
    paddingHorizontal: DS.spacing.lg,
    paddingBottom: DS.spacing.xs,
  },
  modalBody: {
    ...DS.type.body,
    textAlign: "center",
    paddingHorizontal: DS.spacing.lg,
    paddingBottom: DS.spacing.lg,
  },
  modalDivider: {
    height: 1,
  },
  modalActions: {
    flexDirection: "row",
  },
  modalBtn: {
    flex: 1,
    paddingVertical: DS.spacing.md,
    alignItems: "center",
  },
  modalBtnDivider: {
    width: 1,
  },
  modalBtnCancel: {
    ...DS.type.body,
    fontWeight: "600",
  },
  modalBtnDelete: {
    ...DS.type.body,
    fontWeight: "700",
  },
});
