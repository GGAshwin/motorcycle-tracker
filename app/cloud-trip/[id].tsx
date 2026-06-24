import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
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

import {
  formatDateFull,
  formatDistKm,
  formatDurationMins,
  formatSpeedKmph,
  formatTime12h,
} from "@/lib/formatters";
import { StatCell } from "@/components/stat-cell";
import { TRIP_COLORS as C, OSM_STYLE } from "@/constants/trip";
import { tripScreenStyles as styles } from "@/styles/tripScreen";

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
      const uri = await captureRef(shareableRef, { format: "png", quality: 1 });
      const fileUri = `${FileSystem.documentDirectory}community-ride-${trip.id}-${Date.now()}.png`;
      await FileSystem.copyAsync({ from: uri, to: fileUri });
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

    return () => { cancelled = true; };
  }, [id, navigation]);

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
    () => (trip ? formatDurationMins(trip.start_time, trip.end_time ?? null) : 0),
    [trip],
  );

  // ── Loading / Empty states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color={C.orange} />
        <Text style={styles.loadingText}>Loading community route…</Text>
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
  const riderName = trip?.username?.toUpperCase() || "RIDER";

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
                COMMUNITY RIDE -{" "}
                {formatDateFull(
                  trip?.created_at ? new Date(trip.created_at).getTime() : Date.now(),
                )}
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
                  if (wp.type === 3 && wp.image_url) setSelectedPhoto(wp.image_url);
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
            <View style={localStyles.profileInfo}>
              <Text style={styles.profileName}>@{trip?.username || "rider"}</Text>
              <View style={localStyles.communityBadge}>
                <Ionicons name="globe-outline" size={14} color={C.headerBg} />
                <Text style={localStyles.communityBadgeText}>Community Route</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Stats */}
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <StatCell label="Distance" value={formatDistKm(trip?.total_dist ?? 0)} unit="KM" />
              <View style={styles.verticalDivider} />
              <StatCell icon="stopwatch-outline" label="Moving Time" value={String(durationMins)} unit="MINS" />
              <View style={styles.verticalDivider} />
              <StatCell icon="speedometer-outline" label="Avg Speed" value={formatSpeedKmph(avgSpeed)} unit="KMPH" />
            </View>
            <View style={styles.divider} />
            <View style={styles.statsRow}>
              <StatCell icon="flame-outline" label="Max Speed" value={formatSpeedKmph(maxSpeed)} unit="KMPH" labelOnTop={false} />
              <View style={styles.verticalDivider} />
              <StatCell icon="time-outline" label="Start Time" value={formatTime12h(trip?.start_time ?? 0)} unit="" labelOnTop={false} />
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

// ── Screen-specific styles (community profile badge only) ─────────────────────

const localStyles = StyleSheet.create({
  profileInfo: {
    flex: 1,
    gap: 4,
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
});
