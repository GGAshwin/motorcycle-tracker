import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
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
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import { captureRef } from "react-native-view-shot";

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

const OSM_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateFull(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
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

export default function CloudTripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const cameraRef = useRef<CameraRef>(null);

  const [trip, setTrip] = useState<any>(null);
  const [points, setPoints] = useState<any[]>([]);
  const [wpList, setWpList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const shareableRef = useRef<View>(null);

  const handleShare = async () => {
    if (!trip || !shareableRef.current) return;
    try {
      // Capture the shareable section as an image
      const uri = await captureRef(shareableRef, {
        format: "png",
        quality: 1,
      });

      // Copy the captured image to a permanent location so it can be shared
      const fileName = `community-ride-${trip.id}-${Date.now()}.png`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.copyAsync({
        from: uri,
        to: fileUri,
      });

      await Share.share({
        url: fileUri,
        message: `Check out @${trip.username}'s epic ride! Distance: ${formatDistKm(trip.total_dist)} km`,
        title: "Community Ride",
      });
    } catch (e) {
      console.error(e);
    }
  };

  // ── Data fetch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const { data: routeData, error: routeErr } = await supabase
          .from("trips")
          .select("*")
          .eq("id", id)
          .single();
        if (routeErr || cancelled) return;

        const { data: ptData } = await supabase
          .from("telemetry_points")
          .select("*")
          .eq("trip_id", routeData.id)
          .order("timestamp", { ascending: true });

        const { data: wpData } = await supabase
          .from("waypoints")
          .select("*")
          .eq("trip_id", routeData.id);

        if (cancelled) return;

        setTrip(routeData);
        navigation.setOptions({ title: `@${routeData.username}` });
        setPoints(ptData || []);
        setWpList(wpData || []);
      } catch (err) {
        console.error("[CloudMap] fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, navigation]);

  // ── Fit map to route after points load ─────────────────────────────────────

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
      geometry: {
        type: "LineString",
        coordinates: points.map((p) => [p.lon, p.lat]),
      },
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

  const durationMins = useMemo(() => {
    if (!trip) return 0;
    return formatDurationMins(trip.start_time, trip.end_time ?? null);
  }, [trip]);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text style={styles.loadingText}>Loading community route…</Text>
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
  const riderName = trip?.username?.toUpperCase() || "RIDER";

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
                COMMUNITY RIDE -{" "}
                {formatDateFull(
                  trip?.created_at
                    ? new Date(trip.created_at).getTime()
                    : Date.now(),
                )}
              </Text>
            </View>
          </View>

          {/* ── Map View ── */}
          <Pressable
            style={[styles.mapContainer, mapExpanded && styles.mapExpanded]}
            onPress={() => !mapExpanded && setMapExpanded(true)}
            disabled={mapExpanded}
          >
            <Map
              ref={undefined}
              style={StyleSheet.absoluteFillObject}
              mapStyle={OSM_STYLE}
              dragPan={mapExpanded}
              touchZoom={mapExpanded}
            >
              <Camera
                ref={cameraRef}
                initialViewState={{
                  center: [first.lon, first.lat],
                  zoom: 12,
                }}
              />

              <GeoJSONSource id="route" data={routeGeoJSON}>
                <Layer
                  id="route-line"
                  type="line"
                  paint={{ "line-color": C.routeBlue, "line-width": 4 }}
                />
              </GeoJSONSource>

              {/* Start Marker */}
              <Marker lngLat={[first.lon, first.lat]}>
                <View style={styles.startMarker}>
                  <View style={styles.startMarkerInner} />
                </View>
              </Marker>

              {/* End Marker */}
              <Marker lngLat={[last.lon, last.lat]}>
                <View style={styles.endMarker}>
                  <Ionicons name="location" size={28} color={C.routeBlue} />
                </View>
              </Marker>

              {/* Waypoints */}
              {wpList.map((wp) => (
                <Marker
                  key={wp.id}
                  lngLat={[wp.lon, wp.lat]}
                  onPress={() => {
                    if (wp.type === 3 && wp.image_url) {
                      setSelectedPhoto(wp.image_url);
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
            </Map>

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
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                @{trip?.username || "rider"}
              </Text>
              <View style={styles.communityBadge}>
                <Ionicons name="globe-outline" size={14} color={C.headerBg} />
                <Text style={styles.communityBadgeText}>Community Route</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* ── Stats Grid ── */}
          <View style={styles.statsCard}>
            {/* Row 1 */}
            <View style={styles.statsRow}>
              <StatCell
                label="Distance"
                value={formatDistKm(trip?.total_dist ?? 0)}
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
                value={formatTime(trip?.start_time ?? 0)}
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

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom Action Bar ── */}
      <View style={styles.bottomBar}>
        <Pressable
          style={styles.bottomBtn}
          onPress={() => setMapExpanded(true)}
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
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
    color: C.textDark,
    letterSpacing: 0.5,
  },
  communityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  communityBadgeText: {
    fontSize: 12,
    color: C.headerBg,
    fontWeight: "500",
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
    paddingBottom: 20,
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
