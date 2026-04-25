import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Image, Pressable } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { supabase } from '@/lib/supabase';

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

function formatSpeed(ms: number): string {
  return `${(ms * 3.6).toFixed(0)} km/h`;
}

function StatItem({
  label,
  value,
  highlight,
  style
}: {
  label: string;
  value: string;
  highlight?: boolean;
  style?: object;
}) {
  return (
    <View style={[styles.statItem, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && { color: C.orange }]}>
        {value}
      </Text>
    </View>
  );
}

export default function CloudTripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['18%', '50%'], []);

  const [trip, setTrip]       = useState<any>(null);
  const [points, setPoints]   = useState<any[]>([]);
  const [wpList, setWpList]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const { data: routeData, error: routeErr } = await supabase.from('trips').select('*').eq('id', id).single();
        if (routeErr || cancelled) return;
        
        const { data: ptData } = await supabase.from('telemetry_points').select('*').eq('trip_id', routeData.id).order('timestamp', { ascending: true });
        const { data: wpData } = await supabase.from('waypoints').select('*').eq('trip_id', routeData.id);

        if (cancelled) return;
        
        setTrip(routeData);
        navigation.setOptions({ title: `@${routeData.username}` });
        setPoints(ptData || []);
        setWpList(wpData || []);
      } catch (err) {
        console.error('[CloudMap] fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (points.length < 2 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(
      points.map(p => ({ latitude: p.lat, longitude: p.lon })),
      { edgePadding: { top: 60, right: 40, bottom: 220, left: 40 }, animated: true }
    );
  }, [points]);

  const routeCoords = useMemo(
    () => points.map(p => ({ latitude: p.lat, longitude: p.lon })),
    [points]
  );

  const maxSpeed = useMemo(
    () => points.reduce((max, p) => Math.max(max, p.speed ?? 0), 0),
    [points]
  );

  const avgSpeed = useMemo(() => {
    const moving = points.filter(p => (p.speed ?? 0) > 0.5);
    if (moving.length === 0) return 0;
    return moving.reduce((sum, p) => sum + (p.speed ?? 0), 0) / moving.length;
  }, [points]);

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text style={styles.loadingText}>Loading cloud route…</Text>
      </View>
    );
  }

  if (points.length < 2) {
    return (
      <View style={styles.centred}>
        <Text style={styles.emptyIcon}>📍</Text>
        <Text style={styles.emptyTitle}>Incomplete route data</Text>
      </View>
    );
  }

  const first = points[0];
  const last  = points[points.length - 1];

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
        <Polyline
          coordinates={routeCoords}
          strokeColor={C.orange}
          strokeWidth={4}
        />

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

        {wpList.map(wp => (
          <Marker
            key={wp.id}
            coordinate={{ latitude: wp.lat, longitude: wp.lon }}
            title={wp.type === 1 ? "Hazard" : wp.type === 2 ? "Viewpoint" : "Photo Marker (Tap to view)"}
            pinColor={wp.type === 1 ? "red" : wp.type === 2 ? "blue" : "purple"}
            onPress={() => {
              if (wp.type === 3 && wp.image_url) {
                setSelectedPhoto(wp.image_url);
              }
            }}
          />
        ))}
      </MapView>

      {selectedPhoto && (
        <View style={styles.photoOverlay}>
          <Image source={{ uri: selectedPhoto }} style={styles.fullPhoto} resizeMode="contain" />
          <Pressable style={styles.closeBtn} onPress={() => setSelectedPhoto(null)}>
            <Text style={styles.closeBtnText}>Close Photo</Text>
          </Pressable>
        </View>
      )}

      {trip && (
        <BottomSheet
          ref={bottomSheetRef}
          snapPoints={snapPoints}
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.handleIndicator}
        >
          <BottomSheetScrollView contentContainerStyle={styles.bottomSheetContent}>
            <View style={styles.statsRow}>
              <StatItem label="DISTANCE" value={formatDist(trip.total_dist)} />
              <View style={styles.statsDivider} />
              <StatItem
                label="DURATION"
                value={formatDuration(trip.start_time, trip.end_time ?? null)}
              />
            </View>
            <View style={styles.statsRowDivider} />
            <View style={styles.statsRow}>
              <StatItem label="AVG SPEED" value={formatSpeed(avgSpeed)} />
              <View style={styles.statsDivider} />
              <StatItem
                label="MAX SPEED"
                value={formatSpeed(maxSpeed)}
                highlight={maxSpeed * 3.6 > 100}
              />
            </View>
            <View style={styles.extraSpacing} />
          </BottomSheetScrollView>
        </BottomSheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centred: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg, gap: 12, padding: 32 },
  loadingText: { color: C.textSecondary, fontSize: 15, marginTop: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '600' },
  bottomSheetBackground: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.border },
  handleIndicator: { backgroundColor: C.border, width: 40 },
  bottomSheetContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  statsRowDivider: { height: 1, backgroundColor: C.border, marginVertical: 16 },
  statsDivider: { width: 1, height: 36, backgroundColor: C.border },
  statItem: { alignItems: 'center', gap: 4, flex: 1 },
  statLabel: { color: C.textSecondary, fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  statValue: { color: C.textPrimary, fontSize: 22, fontWeight: '300', fontVariant: ['tabular-nums'] },
  extraSpacing: { height: 60 },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  fullPhoto: {
    width: '100%',
    height: '80%',
  },
  closeBtn: {
    position: 'absolute',
    bottom: 50,
    backgroundColor: '#3A0A0A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FF3B30'
  },
  closeBtnText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: 'bold'
  }
});
