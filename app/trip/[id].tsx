import { Ionicons } from "@expo/vector-icons";
import { asc, eq } from "drizzle-orm";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { captureRef } from "react-native-view-shot";

import { getDb } from "@/db/client";
import type { TelemetryPoint, Trip, Waypoint } from "@/db/schema";
import { telemetryPoints, trips, waypoints } from "@/db/schema";
import { supabase } from "@/lib/supabase";
import { pushLocalDataToCloud } from "@/lib/syncService";
import * as SecureStore from "expo-secure-store";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// ── Colour palette ────────────────────────────────────────────────────────────

const C = {
  // New design colors
  headerBg: "#0F4D4A",
  cardBg: "#FFFFFF",
  textDark: "#111111",
  textMuted: "#666666",
  iconAccent: "#C87030",
  routeBlue: "#2196F3",
  divider: "#E5E5E5",
  // Legacy (kept for loading/empty states)
  bg: "#0D0D0F",
  orange: "#FF6B00",
  textSecondary: "#8E8E93",
} as const;

// ── Map style (lighter for new design) ────────────────────────────────────────

const MAP_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateFull(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
}

function formatDurationMins(startMs: number, endMs: number | null): number {
  if (!endMs) return 0;
  return Math.floor((endMs - startMs) / 60000);
}

function formatDistKm(metres: number): string {
  return (metres / 1000).toFixed(1);
}

function formatSpeedKmph(ms: number): string {
  return (ms * 3.6).toFixed(1);
}

// ── Stat Cell Component ───────────────────────────────────────────────────────

function StatCell({
  icon,
  label,
  value,
  unit,
  labelOnTop = true,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit: string;
  labelOnTop?: boolean;
}) {
  const content = labelOnTop ? (
    <>
      <View style={styles.statLabelRow}>
        {icon && (
          <Ionicons
            name={icon}
            size={16}
            color={C.iconAccent}
            style={styles.statIcon}
          />
        )}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <View style={styles.statValueRow}>
        <Text style={styles.statValueLarge}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
    </>
  ) : (
    <>
      <View style={styles.statValueRow}>
        <Text style={styles.statValueLarge}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
      <View style={styles.statLabelRow}>
        {icon && (
          <Ionicons
            name={icon}
            size={16}
            color={C.iconAccent}
            style={styles.statIcon}
          />
        )}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </>
  );

  return <View style={styles.statCell}>{content}</View>;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const numericId = parseInt(id, 10);
  const navigation = useNavigation();
  const mapRef = useRef<MapView>(null);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [points, setPoints] = useState<TelemetryPoint[]>([]);
  const [wpList, setWpList] = useState<Waypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const shareableRef = useRef<View>(null);

  // Load username
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
      // Capture the shareable section as an image
      const uri = await captureRef(shareableRef, {
        format: "png",
        quality: 1,
      });

      // Copy the captured image to a permanent location so it can be shared
      const fileName = `ride-${trip.id}-${Date.now()}.png`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.copyAsync({
        from: uri,
        to: fileUri,
      });

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
    const { latitude, longitude } = e.nativeEvent.coordinate;

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
    });

    if (!result.canceled && result.assets[0].uri) {
      const manipResult = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );

      if (!manipResult.base64) return;

      const base64Len = manipResult.base64.length;
      const sizeKb = (base64Len * 3) / 4 / 1024;

      if (sizeKb > 500) {
        alert(
          `This photo is ${Math.round(sizeKb)}KB. The community upload limit is 500KB. Please try crop it smaller next time!`,
        );
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
            username: username,
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

    return () => {
      cancelled = true;
    };
  }, [numericId, navigation]);

  // ── Fit map to route after points load ─────────────────────────────────────

  useEffect(() => {
    if (points.length < 2 || !mapRef.current) return;
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        points.map((p) => ({ latitude: p.lat, longitude: p.lon })),
        {
          edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
          animated: true,
        },
      );
    }, 100);
  }, [points, mapExpanded]);

  const routeCoords = useMemo(
    () => points.map((p) => ({ latitude: p.lat, longitude: p.lon })),
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

  const durationMins = useMemo(() => {
    if (!trip) return 0;
    return formatDurationMins(trip.startTime, trip.endTime ?? null);
  }, [trip]);

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
        {/* Shareable content wrapper */}
        <View ref={shareableRef} collapsable={false}>
          {/* ── Header Bar ── */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="bicycle" size={32} color="#FFF" />
              <Text style={styles.headerIconLabel}>RIDE</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>
                {riderName}&apos;S EPIC RIDE
              </Text>
              <Text style={styles.headerSubtitle}>
                EPIC RIDE - {formatDateFull(trip?.date ?? Date.now())}
              </Text>
            </View>
          </View>

          {/* ── Map View ── */}
          <Pressable
            style={[styles.mapContainer, mapExpanded && styles.mapExpanded]}
            onPress={() => !mapExpanded && setMapExpanded(true)}
            disabled={mapExpanded}
          >
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              customMapStyle={MAP_STYLE}
              showsUserLocation={false}
              showsCompass
              scrollEnabled={mapExpanded}
              zoomEnabled={mapExpanded}
              onLongPress={handleMapLongPress}
              initialRegion={{
                latitude: first.lat,
                longitude: first.lon,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              <Polyline
                coordinates={routeCoords}
                strokeColor={C.routeBlue}
                strokeWidth={4}
              />

              {/* Start Marker */}
              <Marker
                coordinate={{ latitude: first.lat, longitude: first.lon }}
                title="Start"
              >
                <View style={styles.startMarker}>
                  <View style={styles.startMarkerInner} />
                </View>
              </Marker>

              {/* End Marker */}
              <Marker
                coordinate={{ latitude: last.lat, longitude: last.lon }}
                title="End"
              >
                <View style={styles.endMarker}>
                  <Ionicons name="location" size={28} color={C.routeBlue} />
                </View>
              </Marker>

              {/* Waypoints */}
              {wpList.map((wp) => (
                <Marker
                  key={wp.id}
                  coordinate={{ latitude: wp.lat, longitude: wp.lon }}
                  title={
                    wp.type === 1
                      ? "Hazard"
                      : wp.type === 2
                        ? "Viewpoint"
                        : "Photo"
                  }
                  onPress={() => {
                    if (wp.type === 3 && wp.imageUrl) {
                      setSelectedPhoto(wp.imageUrl);
                    }
                  }}
                >
                  <View
                    style={[
                      styles.waypointMarker,
                      {
                        backgroundColor:
                          wp.type === 1
                            ? "#E53935"
                            : wp.type === 2
                              ? "#1E88E5"
                              : C.iconAccent,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        wp.type === 1
                          ? "warning"
                          : wp.type === 2
                            ? "eye"
                            : "camera"
                      }
                      size={16}
                      color="#FFF"
                    />
                  </View>
                </Marker>
              ))}
            </MapView>

            {!mapExpanded && (
              <View style={styles.mapOverlay}>
                <Text style={styles.mapOverlayText}>Tap to expand</Text>
              </View>
            )}

            {mapExpanded && (
              <Pressable
                style={styles.collapseBtn}
                onPress={() => setMapExpanded(false)}
              >
                <Ionicons name="contract-outline" size={20} color="#FFF" />
                <Text style={styles.collapseBtnText}>Collapse</Text>
              </Pressable>
            )}
          </Pressable>

          {/* ── Profile Section ── */}
          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <Ionicons name="person-circle" size={48} color={C.headerBg} />
            </View>
            <Text style={styles.profileName}>{riderName}</Text>
          </View>

          <View style={styles.divider} />

          {/* ── Stats Grid ── */}
          <View style={styles.statsCard}>
            {/* Row 1 */}
            <View style={styles.statsRow}>
              <StatCell
                label="Distance"
                value={formatDistKm(trip?.totalDist ?? 0)}
                unit="KM"
              />
              <View style={styles.verticalDivider} />
              <StatCell
                icon="stopwatch-outline"
                label="Moving Time"
                value={String(durationMins)}
                unit="MINS"
              />
              <View style={styles.verticalDivider} />
              <StatCell
                icon="speedometer-outline"
                label="Avg Speed"
                value={formatSpeedKmph(avgSpeed)}
                unit="KMPH"
              />
            </View>

            <View style={styles.divider} />

            {/* Row 2 */}
            <View style={styles.statsRow}>
              <StatCell
                icon="flame-outline"
                label="Max Speed"
                value={formatSpeedKmph(maxSpeed)}
                unit="KMPH"
                labelOnTop={false}
              />
              <View style={styles.verticalDivider} />
              <StatCell
                icon="time-outline"
                label="Start Time"
                value={formatTime(trip?.startTime ?? 0)}
                unit=""
                labelOnTop={false}
              />
              <View style={styles.verticalDivider} />
              <StatCell
                icon="analytics-outline"
                label="Top Altitude"
                value={String(
                  Math.round(
                    points.reduce((max, p) => Math.max(max, p.alt ?? 0), 0),
                  ),
                )}
                unit="M"
                labelOnTop={false}
              />
            </View>
          </View>
        </View>
        {/* End shareable content */}

        {/* ── Share/Publish Section ── */}
        <View style={styles.publishSection}>
          {!trip?.isPublic ? (
            <Pressable style={styles.publishBtn} onPress={handleShareRoute}>
              <Ionicons name="cloud-upload-outline" size={20} color="#FFF" />
              <Text style={styles.publishBtnText}>Share to Community</Text>
            </Pressable>
          ) : (
            <View style={styles.publishedRow}>
              <View style={styles.publishedBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={C.headerBg}
                />
                <Text style={styles.publishedText}>Shared to Community</Text>
              </View>
              <Pressable style={styles.unshareBtn} onPress={handleUnshareRoute}>
                <Text style={styles.unshareBtnText}>Unshare</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom Action Bar ── */}
      <View style={styles.bottomBar}>
        <Pressable
          style={styles.bottomBtn}
          onPress={() => {
            setMapExpanded(true);
            // Scroll to top
          }}
        >
          <Ionicons name="expand-outline" size={22} color={C.textDark} />
          <Text style={styles.bottomBtnText}>VIEW ROUTE</Text>
        </Pressable>
        <View style={styles.bottomDivider} />
        <Pressable style={styles.bottomBtn} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={22} color={C.textDark} />
          <Text style={styles.bottomBtnText}>SHARE</Text>
        </Pressable>
      </View>

      {/* ── Photo Overlay ── */}
      {selectedPhoto && (
        <View style={styles.photoOverlay}>
          <Image
            source={{ uri: selectedPhoto }}
            style={styles.fullPhoto}
            resizeMode="contain"
          />
          <Pressable
            style={styles.closeBtn}
            onPress={() => setSelectedPhoto(null)}
          >
            <Ionicons name="close" size={24} color="#FF3B30" />
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  scrollView: {
    flex: 1,
  },

  // Loading / Empty states
  centred: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  emptyBody: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },

  // Header
  header: {
    backgroundColor: C.headerBg,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    alignItems: "center",
    gap: 2,
  },
  headerIconLabel: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 4,
  },

  // Map
  mapContainer: {
    height: SCREEN_HEIGHT * 0.35,
    backgroundColor: "#E5E5E5",
  },
  mapExpanded: {
    height: SCREEN_HEIGHT * 0.6,
  },
  mapOverlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  mapOverlayText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "500",
  },
  collapseBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  collapseBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },

  // Custom Markers
  startMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 3,
    borderColor: C.routeBlue,
    justifyContent: "center",
    alignItems: "center",
  },
  startMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.routeBlue,
  },
  endMarker: {
    alignItems: "center",
    justifyContent: "center",
  },
  waypointMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  // Profile Section
  profileSection: {
    backgroundColor: C.cardBg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
    color: C.textDark,
    letterSpacing: 0.5,
  },

  // Stats Card
  statsCard: {
    backgroundColor: C.cardBg,
    marginTop: 1,
  },
  statsRow: {
    flexDirection: "row",
    paddingVertical: 16,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statIcon: {
    marginRight: 2,
  },
  statLabel: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: "500",
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginTop: 4,
  },
  statValueLarge: {
    fontSize: 22,
    fontWeight: "700",
    color: C.textDark,
  },
  statUnit: {
    fontSize: 12,
    fontWeight: "600",
    color: C.textDark,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: C.divider,
    marginVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: C.divider,
  },

  // Publish Section
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

  // Bottom Bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.cardBg,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: C.divider,
    paddingBottom: 20, // Safe area
  },
  bottomBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  bottomBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: C.textDark,
    letterSpacing: 0.5,
  },
  bottomDivider: {
    width: 1,
    backgroundColor: C.divider,
    marginVertical: 12,
  },

  // Photo Overlay
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  fullPhoto: {
    width: "100%",
    height: "80%",
  },
  closeBtn: {
    position: "absolute",
    bottom: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,59,48,0.15)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  closeBtnText: {
    color: "#FF3B30",
    fontSize: 16,
    fontWeight: "600",
  },
});
