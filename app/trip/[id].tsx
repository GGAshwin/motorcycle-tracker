import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { asc, eq } from 'drizzle-orm';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Image, Pressable } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

import { getDb } from '@/db/client';
import { telemetryPoints, trips, waypoints } from '@/db/schema';
import type { TelemetryPoint, Trip, Waypoint } from '@/db/schema';
import * as SecureStore from 'expo-secure-store';
import { pushLocalDataToCloud } from '@/lib/syncService';
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

function formatSpeed(ms: number): string {
  return `${(ms * 3.6).toFixed(0)} km/h`;
}

// ── Stat item ─────────────────────────────────────────────────────────────────

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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = parseInt(id, 10);
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['18%', '50%'], []);

  const [trip, setTrip]       = useState<Trip | null>(null);
  const [points, setPoints]   = useState<TelemetryPoint[]>([]);
  const [wpList, setWpList]   = useState<Waypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const handleShareRoute = async () => {
    if (!trip) return;
    try {
      const username = await SecureStore.getItemAsync('moto_username');
      if (!username) {
        navigation.navigate('auth' as never);
        return;
      }
      await getDb().update(trips).set({ isPublic: true, isSynced: false }).where(eq(trips.id, trip.id));
      setTrip({ ...trip, isPublic: true });
      alert("Route published! Syncing...");
      await pushLocalDataToCloud();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnshareRoute = async () => {
    if (!trip) return;
    try {
      const username = await SecureStore.getItemAsync('moto_username');
      if (username) {
        const { error: deleteErr } = await supabase.from('trips').delete().eq('local_id', trip.id).eq('username', username);
        if (deleteErr) throw deleteErr;
      }
      await getDb().update(trips).set({ isPublic: false, isSynced: true }).where(eq(trips.id, trip.id));
      setTrip({ ...trip, isPublic: false });
      alert("Route is now private.");
    } catch (e: any) {
      alert("Failed to unshare cloud route: " + e.message);
      console.error(e);
    }
  };

  const handleMapLongPress = async (e: any) => {
    if (!trip) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true, // Let rider crop to square/prefered ratio
    });

    if (!result.canceled && result.assets[0].uri) {
      // Physically resize the cropped image to max 800px width at decent quality
      const manipResult = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipResult.base64) return;

      // Calculate byte size: base64 is 4 characters per 3 bytes
      const base64Len = manipResult.base64.length;
      const sizeKb = (base64Len * 3 / 4) / 1024;

      if (sizeKb > 500) {
        alert(`This photo is ${Math.round(sizeKb)}KB. The community upload limit is 500KB. Please try crop it smaller next time!`);
        return;
      }

      const base64Str = `data:image/jpeg;base64,${manipResult.base64}`;
      const newWp: any = {
        tripId: trip.id,
        lat: latitude,
        lon: longitude,
        type: 3, 
        imageUrl: base64Str,
        timestamp: Date.now(),
        isSynced: false
      };
      const res = await getDb().insert(waypoints).values(newWp).returning();
      setWpList([...wpList, res[0]]);
      
      const username = await SecureStore.getItemAsync('moto_username');
      if (trip.isPublic && username) {
        const { data: remoteTrip } = await supabase.from('trips').select('id').eq('local_id', trip.id).eq('username', username).single();
        if (remoteTrip) {
           await supabase.from('waypoints').insert({
             trip_id: remoteTrip.id,
             username: username,
             lat: latitude,
             lon: longitude,
             type: 3,
             image_url: base64Str,
             timestamp: newWp.timestamp
           });
           await getDb().update(waypoints).set({ isSynced: true }).where(eq(waypoints.id, res[0].id));
        }
      }
      alert("Photo marker attached to route!");
    }
  };

  // ── Data fetch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isNaN(numericId)) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const db = getDb();
        const [tripRows, pointRows, wpRows] = await Promise.all([
          db.select().from(trips).where(eq(trips.id, numericId)).limit(1),
          db.select()
            .from(telemetryPoints)
            .where(eq(telemetryPoints.tripId, numericId))
            .orderBy(asc(telemetryPoints.timestamp)),
          db.select().from(waypoints).where(eq(waypoints.tripId, numericId)),
        ]);

        if (cancelled) return;

        if (tripRows[0]) {
          setTrip(tripRows[0]);
          navigation.setOptions({ title: formatDate(tripRows[0].date) });
        }
        setPoints(pointRows);
        setWpList(wpRows);
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
        onLongPress={handleMapLongPress}
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
              if (wp.type === 3 && wp.imageUrl) {
                setSelectedPhoto(wp.imageUrl);
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

      {/* ── Scrollable Bottom Sheet for Stats ── */}
      {trip && (
        <BottomSheet
          ref={bottomSheetRef}
          snapPoints={snapPoints}
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.handleIndicator}
        >
          <BottomSheetScrollView contentContainerStyle={styles.bottomSheetContent}>
            <View style={styles.statsRow}>
              <StatItem label="DISTANCE" value={formatDist(trip.totalDist)} />
              <View style={styles.statsDivider} />
              <StatItem
                label="DURATION"
                value={formatDuration(trip.startTime, trip.endTime ?? null)}
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
            
            {!trip.isPublic ? (
              <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
                <Text style={styles.btnPrimary} onPress={handleShareRoute}>Share Route Publicly</Text>
              </View>
            ) : (
              <View style={{ marginTop: 24, paddingHorizontal: 16, flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.btnPrimary, { backgroundColor: '#2C2C2E', color: C.textSecondary }]}>Shared to Community</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.btnPrimary, { backgroundColor: '#3A0A0A', color: '#FF3B30' }]} onPress={handleUnshareRoute}>Unshare</Text>
                </View>
              </View>
            )}

            <View style={styles.extraSpacing} />
          </BottomSheetScrollView>
        </BottomSheet>
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

  // Bottom Sheet 
  bottomSheetBackground: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  handleIndicator: {
    backgroundColor: C.border,
    width: 40,
  },
  bottomSheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statsRowDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 16,
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
  btnPrimary: {
    color: '#FFF',
    backgroundColor: C.orange,
    padding: 16,
    borderRadius: 14,
    textAlign: 'center',
    fontWeight: '700',
    overflow: 'hidden'
  },
  extraSpacing: {
    height: 60,
  },
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
