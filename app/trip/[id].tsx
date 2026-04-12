import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { eq, asc } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { telemetryPoints, trips } from '@/db/schema';
import type { Trip, TelemetryPoint } from '@/db/schema';

// ── Colour palette ────────────────────────────────────────────────────────────

const C = {
  bg:            '#0D0D0F',
  surface:       '#1C1C1E',
  border:        '#2C2C2E',
  orange:        '#FF6B00',
  textPrimary:   '#FFFFFF',
  textSecondary: '#8E8E93',
} as const;

// ── Dark map style ────────────────────────────────────────────────────────────

const DARK_MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#8E8E93' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#0D0D0F' }] },
  { featureType: 'road',   elementType: 'geometry',        stylers: [{ color: '#2C2C2E' }] },
  { featureType: 'road',   elementType: 'geometry.stroke', stylers: [{ color: '#0D0D0F' }] },
  { featureType: 'water',  elementType: 'geometry',        stylers: [{ color: '#0D0D0F' }] },
  { featureType: 'poi',    stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ── Lean angle zone helpers ───────────────────────────────────────────────────

function leanColor(angle: number | null | undefined): string {
  const abs = Math.abs(angle ?? 0);
  if (abs > 50) return '#FF6B00';   // orange
  if (abs > 30) return '#FFD60A';   // yellow
  return '#FFFFFF';                 // white
}

// Groups consecutive points that share the same lean color zone into a single
// Polyline. Boundary points are shared between adjacent groups so there are no
// visible gaps where the color changes.
interface Segment {
  key: string;
  color: string;
  coords: { latitude: number; longitude: number }[];
}

function buildSegments(pts: TelemetryPoint[]): Segment[] {
  if (pts.length < 2) return [];

  const groups: Segment[] = [];
  let color = leanColor(pts[0].leanAngle);
  let coords: { latitude: number; longitude: number }[] = [
    { latitude: pts[0].lat, longitude: pts[0].lon },
  ];

  for (let i = 1; i < pts.length; i++) {
    const pt = pts[i];
    const c = leanColor(pt.leanAngle);
    coords.push({ latitude: pt.lat, longitude: pt.lon });

    if (c !== color || i === pts.length - 1) {
      groups.push({ key: `seg-${groups.length}`, color, coords });
      // Overlap by one point so adjacent segments connect seamlessly.
      color  = c;
      coords = [{ latitude: pt.lat, longitude: pt.lon }];
    }
  }

  return groups;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
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

// ── Stat item ─────────────────────────────────────────────────────────────────

function StatItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && { color: C.orange }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = parseInt(id, 10);
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);

  const [trip, setTrip]     = useState<Trip | null>(null);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isNaN(numericId)) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const db = getDb();
        const [tripRows, pointRows] = await Promise.all([
          db.select().from(trips).where(eq(trips.id, numericId)).limit(1),
          db.select()
            .from(telemetryPoints)
            .where(eq(telemetryPoints.tripId, numericId))
            .orderBy(asc(telemetryPoints.timestamp)),
        ]);

        if (cancelled) return;

        if (tripRows[0]) {
          setTrip(tripRows[0]);
          navigation.setOptions({ title: formatDate(tripRows[0].date) });
        }
        setPoints(pointRows);
      } catch (err) {
        console.error('[TripMap] fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [numericId]);

  // ── Fit map to route after points load ─────────────────────────────────────

  useEffect(() => {
    if (points.length < 2 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(
      points.map(p => ({ latitude: p.lat, longitude: p.lon })),
      { edgePadding: { top: 60, right: 40, bottom: 220, left: 40 }, animated: true }
    );
  }, [points]);

  const segments = useMemo(() => buildSegments(points), [points]);

  const maxLean = useMemo(
    () => points.reduce((max, p) => Math.max(max, Math.abs(p.leanAngle ?? 0)), 0),
    [points]
  );

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text style={styles.loadingText}>Loading route…</Text>
      </View>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (points.length < 2) {
    return (
      <View style={styles.centred}>
        <Text style={styles.emptyIcon}>📍</Text>
        <Text style={styles.emptyTitle}>No route data</Text>
        <Text style={styles.emptyBody}>
          {points.length === 0
            ? 'No GPS points were recorded for this ride.'
            : 'Only one GPS point was recorded — not enough to draw a route.'}
        </Text>
      </View>
    );
  }

  const first = points[0];
  const last  = points[points.length - 1];

  // ── Map ─────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        customMapStyle={DARK_MAP_STYLE}
        userInterfaceStyle="dark"
        showsUserLocation={false}
        showsCompass
        initialRegion={{
          latitude:       first.lat,
          longitude:      first.lon,
          latitudeDelta:  0.01,
          longitudeDelta: 0.01,
        }}
      >
        {segments.map(seg => (
          <Polyline
            key={seg.key}
            coordinates={seg.coords}
            strokeColor={seg.color}
            strokeWidth={4}
          />
        ))}

        <Marker
          coordinate={{ latitude: first.lat, longitude: first.lon }}
          title="Start"
          pinColor="green"
        />
        <Marker
          coordinate={{ latitude: last.lat, longitude: last.lon }}
          title="End"
          pinColor="#FF6B00"
        />
      </MapView>

      {/* ── Stats card ── */}
      {trip && (
        <View style={styles.statsCard}>
          <StatItem label="DISTANCE" value={formatDist(trip.totalDist)} />
          <View style={styles.statsDivider} />
          <StatItem
            label="DURATION"
            value={formatDuration(trip.startTime, trip.endTime ?? null)}
          />
          <View style={styles.statsDivider} />
          <StatItem
            label="MAX LEAN"
            value={`${maxLean.toFixed(1)}°`}
            highlight={maxLean > 50}
          />
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  centred: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
    gap: 12,
    padding: 32,
  },
  loadingText: {
    color: C.textSecondary,
    fontSize: 15,
    marginTop: 8,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  emptyBody: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },

  // Stats card
  statsCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 36,
    paddingHorizontal: 16,
  },
  statsDivider: {
    width: 1,
    height: 36,
    backgroundColor: C.border,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  statLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  statValue: {
    color: C.textPrimary,
    fontSize: 22,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
});
