import { Ionicons } from "@expo/vector-icons";
import { asc, eq } from "drizzle-orm";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import { captureRef } from "react-native-view-shot";
import * as SecureStore from "expo-secure-store";

import { getDb } from "@/db/client";
import type { TelemetryPoint, Trip, Waypoint } from "@/db/schema";
import { telemetryPoints, trips, waypoints } from "@/db/schema";
import { supabase } from "@/lib/supabase";
import { pushLocalDataToCloud } from "@/lib/syncService";
import {
  formatDateFull,
  formatDateShort,
  formatDistKm,
  formatDurationMins,
  formatSpeedKmph,
  formatTime12h,
} from "@/lib/formatters";
import { StatCell } from "@/components/stat-cell";
import { TRIP_COLORS as C, OSM_STYLE } from "@/constants/trip";
import { tripScreenStyles as styles } from "@/styles/tripScreen";

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = parseInt(id, 10);
  const navigation = useNavigation();
  const cameraRef = useRef<CameraRef>(null);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [wpList, setWpList] = useState<Waypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const shareableRef = useRef<View>(null);

  useEffect(() => {
    SecureStore.getItemAsync("moto_username").then(setUsername);
  }, []);

  const handleShareRoute = async () => {
    if (!trip) return;
    try {
      if (!username) {
        navigation.navigate("auth" as never);
        return;
      }
      await getDb()
        .update(trips)
        .set({ isPublic: true, isSynced: false })
        .where(eq(trips.id, trip.id));
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
      if (username) {
        const { error: deleteErr } = await supabase
          .from("trips")
          .delete()
          .eq("local_id", trip.id)
          .eq("username", username);
        if (deleteErr) throw deleteErr;
      }
      await getDb()
        .update(trips)
        .set({ isPublic: false, isSynced: true })
        .where(eq(trips.id, trip.id));
      setTrip({ ...trip, isPublic: false });
      alert("Route is now private.");
    } catch (e: any) {
      alert("Failed to unshare cloud route: " + e.message);
      console.error(e);
    }
  };

  const handleShare = async () => {
    if (!trip || !shareableRef.current) return;
    try {
      const uri = await captureRef(shareableRef, { format: "png", quality: 1 });
      const fileUri = `${FileSystem.documentDirectory}ride-${trip.id}-${Date.now()}.png`;
      await FileSystem.copyAsync({ from: uri, to: fileUri });
      await Share.share({
        url: fileUri,
        message: `Check out my epic ride! Distance: ${formatDistKm(trip.totalDist)} km`,
        title: "My Epic Ride",
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleMapLongPress = async (e: any) => {
    if (!trip) return;
    const [longitude, latitude] = e.nativeEvent.lngLat;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0].uri) {
      const manipResult = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (!manipResult.base64) return;

      const sizeKb = (manipResult.base64.length * 3) / 4 / 1024;
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
        isSynced: false,
      };
      const res = await getDb().insert(waypoints).values(newWp).returning();
      setWpList([...wpList, res[0]]);

      if (trip.isPublic && username) {
        const { data: remoteTrip } = await supabase
          .from("trips")
          .select("id")
          .eq("local_id", trip.id)
          .eq("username", username)
          .single();
        if (remoteTrip) {
          await supabase.from("waypoints").insert({
            trip_id: remoteTrip.id,
            username,
            lat: latitude,
            lon: longitude,
            type: 3,
            image_url: base64Str,
            timestamp: newWp.timestamp,
          });
          await getDb()
            .update(waypoints)
            .set({ isSynced: true })
            .where(eq(waypoints.id, res[0].id));
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
          db
            .select()
            .from(telemetryPoints)
            .where(eq(telemetryPoints.tripId, numericId))
            .orderBy(asc(telemetryPoints.timestamp)),
          db.select().from(waypoints).where(eq(waypoints.tripId, numericId)),
        ]);

        if (cancelled) return;

        if (tripRows[0]) {
          setTrip(tripRows[0]);
          navigation.setOptions({ title: formatDateShort(tripRows[0].date) });
        }
        setPoints(pointRows);
        setWpList(wpRows);
      } catch (err) {
        console.error("[TripMap] fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [numericId, navigation]);

  // ── Fit map to route ────────────────────────────────────────────────────────

  useEffect(() => {
    if (points.length < 2 || !cameraRef.current) return;
    const lngs = points.map((p) => p.lon);
    const lats = points.map((p) => p.lat);
    setTimeout(() => {
      cameraRef.current?.fitBounds(
        [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
        { padding: { top: 40, right: 40, bottom: 40, left: 40 }, duration: 300 },
      );
    }, 100);
  }, [points, mapExpanded]);

  const routeGeoJSON = useMemo<GeoJSON.Feature>(
    () => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: points.map((p) => [p.lon, p.lat]) },
      properties: {},
    }),
    [points],
  );

  const maxSpeed = useMemo(
    () => points.reduce((max, p) => Math.max(max, p.speed ?? 0), 0),
    [points],
  );

  const avgSpeed = useMemo(() => {
    const moving = points.filter((p) => (p.speed ?? 0) > 0.5);
    if (moving.length === 0) return 0;
    return moving.reduce((sum, p) => sum + (p.speed ?? 0), 0) / moving.length;
  }, [points]);

  const durationMins = useMemo(
    () => (trip ? formatDurationMins(trip.startTime, trip.endTime ?? null) : 0),
    [trip],
  );

  // ── Loading / Empty states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text style={styles.loadingText}>Loading route…</Text>
      </View>
    );
  }

  if (points.length < 2) {
    return (
      <View style={styles.centred}>
        <Text style={styles.emptyIcon}>📍</Text>
        <Text style={styles.emptyTitle}>No route data</Text>
        <Text style={styles.emptyBody}>
          {points.length === 0
            ? "No GPS points were recorded for this ride."
            : "Only one GPS point was recorded — not enough to draw a route."}
        </Text>
      </View>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const riderName = username?.toUpperCase() || "RIDER";

  // ── Main UI ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} bounces={false}>
        <View ref={shareableRef} collapsable={false}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="bicycle" size={32} color="#FFF" />
              <Text style={styles.headerIconLabel}>RIDE</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>{riderName}&apos;S EPIC RIDE</Text>
              <Text style={styles.headerSubtitle}>
                EPIC RIDE - {formatDateFull(trip?.date ?? Date.now())}
              </Text>
            </View>
          </View>

          {/* Map */}
          <Pressable
            style={[styles.mapContainer, mapExpanded && styles.mapExpanded]}
            onPress={() => !mapExpanded && setMapExpanded(true)}
            disabled={mapExpanded}
          >
            <Map
              style={StyleSheet.absoluteFillObject}
              mapStyle={OSM_STYLE}
              dragPan={mapExpanded}
              touchZoom={mapExpanded}
              onLongPress={handleMapLongPress}
            >
              <Camera ref={cameraRef} initialViewState={{ center: [first.lon, first.lat], zoom: 12 }} />
              <GeoJSONSource id="route" data={routeGeoJSON}>
                <Layer id="route-line" type="line" paint={{ "line-color": C.routeBlue, "line-width": 4 }} />
              </GeoJSONSource>
              <Marker lngLat={[first.lon, first.lat]}>
                <View style={styles.startMarker}><View style={styles.startMarkerInner} /></View>
              </Marker>
              <Marker lngLat={[last.lon, last.lat]}>
                <View style={styles.endMarker}>
                  <Ionicons name="location" size={28} color={C.routeBlue} />
                </View>
              </Marker>
              {wpList.map((wp) => (
                <Marker key={wp.id} lngLat={[wp.lon, wp.lat]} onPress={() => {
                  if (wp.type === 3 && wp.imageUrl) setSelectedPhoto(wp.imageUrl);
                }}>
                  <View style={[styles.waypointMarker, {
                    backgroundColor: wp.type === 1 ? "#E53935" : wp.type === 2 ? "#1E88E5" : C.iconAccent,
                  }]}>
                    <Ionicons
                      name={wp.type === 1 ? "warning" : wp.type === 2 ? "eye" : "camera"}
                      size={16}
                      color="#FFF"
                    />
                  </View>
                </Marker>
              ))}
            </Map>

            {!mapExpanded && (
              <View style={styles.mapOverlay}>
                <Text style={styles.mapOverlayText}>Tap to expand</Text>
              </View>
            )}
            {mapExpanded && (
              <Pressable style={styles.collapseBtn} onPress={() => setMapExpanded(false)}>
                <Ionicons name="contract-outline" size={20} color="#FFF" />
                <Text style={styles.collapseBtnText}>Collapse</Text>
              </Pressable>
            )}
          </Pressable>

          {/* Profile */}
          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <Ionicons name="person-circle" size={48} color={C.headerBg} />
            </View>
            <Text style={styles.profileName}>{riderName}</Text>
          </View>

          <View style={styles.divider} />

          {/* Stats */}
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <StatCell label="Distance" value={formatDistKm(trip?.totalDist ?? 0)} unit="KM" />
              <View style={styles.verticalDivider} />
              <StatCell icon="stopwatch-outline" label="Moving Time" value={String(durationMins)} unit="MINS" />
              <View style={styles.verticalDivider} />
              <StatCell icon="speedometer-outline" label="Avg Speed" value={formatSpeedKmph(avgSpeed)} unit="KMPH" />
            </View>
            <View style={styles.divider} />
            <View style={styles.statsRow}>
              <StatCell icon="flame-outline" label="Max Speed" value={formatSpeedKmph(maxSpeed)} unit="KMPH" labelOnTop={false} />
              <View style={styles.verticalDivider} />
              <StatCell icon="time-outline" label="Start Time" value={formatTime12h(trip?.startTime ?? 0)} unit="" labelOnTop={false} />
              <View style={styles.verticalDivider} />
              <StatCell
                icon="analytics-outline"
                label="Top Altitude"
                value={String(Math.round(points.reduce((max, p) => Math.max(max, p.alt ?? 0), 0)))}
                unit="M"
                labelOnTop={false}
              />
            </View>
          </View>
        </View>

        {/* Publish section */}
        <View style={localStyles.publishSection}>
          {!trip?.isPublic ? (
            <Pressable style={localStyles.publishBtn} onPress={handleShareRoute}>
              <Ionicons name="cloud-upload-outline" size={20} color="#FFF" />
              <Text style={localStyles.publishBtnText}>Share to Community</Text>
            </Pressable>
          ) : (
            <View style={localStyles.publishedRow}>
              <View style={localStyles.publishedBadge}>
                <Ionicons name="checkmark-circle" size={18} color={C.headerBg} />
                <Text style={localStyles.publishedText}>Shared to Community</Text>
              </View>
              <Pressable style={localStyles.unshareBtn} onPress={handleUnshareRoute}>
                <Text style={localStyles.unshareBtnText}>Unshare</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <Pressable style={styles.bottomBtn} onPress={() => setMapExpanded(true)}>
          <Ionicons name="expand-outline" size={22} color={C.textDark} />
          <Text style={styles.bottomBtnText}>VIEW ROUTE</Text>
        </Pressable>
        <View style={styles.bottomDivider} />
        <Pressable style={styles.bottomBtn} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={22} color={C.textDark} />
          <Text style={styles.bottomBtnText}>SHARE</Text>
        </Pressable>
      </View>

      {/* Photo overlay */}
      {selectedPhoto && (
        <View style={styles.photoOverlay}>
          <Image source={{ uri: selectedPhoto }} style={styles.fullPhoto} resizeMode="contain" />
          <Pressable style={styles.closeBtn} onPress={() => setSelectedPhoto(null)}>
            <Ionicons name="close" size={24} color="#FF3B30" />
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Screen-specific styles (publish section only) ─────────────────────────────

const localStyles = StyleSheet.create({
  publishSection: {
    backgroundColor: C.cardBg,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 12,
  },
  publishBtn: {
    backgroundColor: C.headerBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  publishBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  publishedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  publishedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  publishedText: {
    color: C.headerBg,
    fontSize: 14,
    fontWeight: "500",
  },
  unshareBtn: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  unshareBtnText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "600",
  },
});
