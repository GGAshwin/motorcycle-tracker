import { Ionicons } from "@expo/vector-icons";
import { sql } from "drizzle-orm";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { getDb } from "@/db/client";
import { trips } from "@/db/schema";
import { useCurrentRide } from "@/hooks/useCurrentRide";

// ── Colors ────────────────────────────────────────────────────────────────────

const C = {
  bg: "#0B0B0D",
  card: "#141417",
  cardBorder: "#1F1F24",
  orange: "#FF6D1F",
  orangeDim: "rgba(255, 109, 31, 0.2)",
  red: "#FF3B30",
  green: "#34C759",
  textPrimary: "#FFFFFF",
  textSecondary: "#6B6B70",
  textMuted: "#3A3A3F",
} as const;

// ── Circular Progress Ring ────────────────────────────────────────────────────

const GAUGE_SIZE = 240;
const STROKE_WIDTH = 8;
const RADIUS = (GAUGE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function SpeedGauge({
  speed,
  maxSpeed = 180,
}: {
  speed: number;
  maxSpeed?: number;
}) {
  const progress = Math.min(speed / maxSpeed, 1);
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress * 0.75);

  return (
    <View style={styles.gaugeContainer}>
      <Svg width={GAUGE_SIZE} height={GAUGE_SIZE} style={styles.gaugeSvg}>
        {/* Background ring */}
        <Circle
          cx={GAUGE_SIZE / 2}
          cy={GAUGE_SIZE / 2}
          r={RADIUS}
          stroke={C.cardBorder}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE * 0.75} ${CIRCUMFERENCE * 0.25}`}
          rotation={135}
          origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
        />
        {/* Progress ring */}
        <Circle
          cx={GAUGE_SIZE / 2}
          cy={GAUGE_SIZE / 2}
          r={RADIUS}
          stroke={C.orange}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE * 0.75} ${CIRCUMFERENCE * 0.25}`}
          strokeDashoffset={strokeDashoffset}
          rotation={135}
          origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
        />
      </Svg>

      {/* Speed display in center */}
      <View style={styles.speedDisplay}>
        <Text style={styles.speedValue}>
          {speed < 1 ? "0" : speed.toFixed(0)}
        </Text>
        <Text style={styles.speedUnit}>km/h</Text>
      </View>

      {/* Scale markers */}
      <Text style={styles.scaleMin}>0</Text>
      <Text style={styles.scaleMax}>{maxSpeed}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function RideScreen() {
  const {
    speedKmh,
    distance,
    isRecording,
    isPaused,
    isAutoPaused,
    startRide,
    stopRide,
    pauseRide,
    resumeRide,
  } = useCurrentRide();

  const [loading, setLoading] = useState(false);
  const [rideError, setRideError] = useState<string | null>(null);
  const [odometer, setOdometer] = useState({ count: 0, totalDist: 0 });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const result = await getDb()
            .select({
              count: sql<number>`count(*)`,
              totalDist: sql<number>`sum(${trips.totalDist})`,
            })
            .from(trips);
          if (active && result[0]) {
            setOdometer({
              count: result[0].count || 0,
              totalDist: result[0].totalDist || 0,
            });
          }
        } catch (err) {
          console.error("Failed to fetch odometer data:", err);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    if (isRecording) {
      activateKeepAwakeAsync();
    } else {
      deactivateKeepAwake();
    }
    return () => {
      deactivateKeepAwake();
    };
  }, [isRecording]);

  const pulse = useRef(new Animated.Value(1)).current;
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulse]);

  const handleToggle = useCallback(async () => {
    setRideError(null);
    setLoading(true);
    try {
      if (isRecording) {
        pulse.stopAnimation();
        pulse.setValue(1);
        await stopRide();
        const result = await getDb()
          .select({
            count: sql<number>`count(*)`,
            totalDist: sql<number>`sum(${trips.totalDist})`,
          })
          .from(trips);
        if (result[0]) {
          setOdometer({
            count: result[0].count || 0,
            totalDist: result[0].totalDist || 0,
          });
        }
      } else {
        await startRide();
        startPulse();
      }
    } catch (err) {
      pulse.stopAnimation();
      pulse.setValue(1);
      setRideError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [isRecording, startRide, stopRide, pulse, startPulse]);

  const handlePauseResume = useCallback(async () => {
    setRideError(null);
    setLoading(true);
    try {
      if (isPaused) {
        await resumeRide();
        startPulse();
      } else {
        pulse.stopAnimation();
        pulse.setValue(1);
        await pauseRide();
      }
    } catch (err) {
      setRideError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [isPaused, pauseRide, resumeRide, pulse, startPulse]);

  const totalDist = odometer.totalDist + (isRecording ? distance : 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons name="bicycle" size={20} color={C.orange} />
          </View>
          <Text style={styles.brandName}>MotoTrack</Text>
        </View>

        {isRecording && (
          <View style={[styles.recBadge, isPaused && styles.recBadgePaused]}>
            <Animated.View
              style={[
                styles.recDot,
                isPaused && styles.recDotPaused,
                !isPaused && { opacity: pulse },
              ]}
            />
            <Text style={[styles.recText, isPaused && styles.recTextPaused]}>
              {isAutoPaused ? "AUTO-PAUSED" : isPaused ? "PAUSED" : "REC"}
            </Text>
          </View>
        )}
      </View>

      {/* Speed Gauge */}
      <View style={styles.gaugeWrapper}>
        <SpeedGauge speed={speedKmh} />
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Ionicons name="flag-outline" size={18} color={C.orange} />
          <Text style={styles.statValue}>{odometer.count}</Text>
          <Text style={styles.statLabel}>Trips</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statBox}>
          <Ionicons name="speedometer-outline" size={18} color={C.orange} />
          <Text style={styles.statValue}>
            {totalDist < 1000
              ? `${Math.round(totalDist)}m`
              : `${(totalDist / 1000).toFixed(1)}km`}
          </Text>
          <Text style={styles.statLabel}>Total Distance</Text>
        </View>
      </View>

      {/* Bottom Actions */}
      <View style={styles.bottomSection}>
        {rideError && <Text style={styles.errorText}>{rideError}</Text>}

        {/* Current Ride Distance */}
        {isRecording && (
          <View style={styles.currentRide}>
            <View style={styles.currentRideLeft}>
              <Text style={styles.currentRideTitle}>This Ride</Text>
              <Text style={styles.currentRideMeta}>
                {distance < 1000
                  ? `${Math.round(distance)} m`
                  : `${(distance / 1000).toFixed(2)} km`}
              </Text>
            </View>
            <View style={styles.currentRideLive}>
              <Animated.View
                style={[
                  styles.liveDot,
                  isPaused && styles.liveDotPaused,
                  !isPaused && { opacity: pulse },
                ]}
              />
              <Text
                style={[styles.liveText, isPaused && styles.liveTextPaused]}
              >
                {isAutoPaused ? "AUTO-PAUSED" : isPaused ? "PAUSED" : "LIVE"}
              </Text>
            </View>
          </View>
        )}

        {isRecording ? (
          <View style={styles.activeButtons}>
            <Pressable
              style={({ pressed }) => [
                styles.mainBtn,
                styles.mainBtnStop,
                loading && styles.mainBtnDisabled,
                pressed && !loading && styles.btnPressed,
              ]}
              onPress={handleToggle}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Text style={styles.mainBtnText}>End Ride</Text>
                  <Ionicons name="stop-circle" size={24} color="#FFF" />
                </>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.mainBtn,
                styles.mainBtnPause,
                loading && styles.mainBtnDisabled,
                pressed && !loading && styles.btnPressed,
              ]}
              onPress={handlePauseResume}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Text style={styles.mainBtnText}>
                    {isPaused ? "Resume" : "Pause"}
                  </Text>
                  <Ionicons
                    name={isPaused ? "play-circle" : "pause-circle"}
                    size={24}
                    color="#FFF"
                  />
                </>
              )}
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.mainBtn,
              styles.mainBtnStart,
              loading && styles.mainBtnDisabled,
              pressed && !loading && styles.btnPressed,
            ]}
            onPress={handleToggle}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Text style={styles.mainBtnText}>Start Ride</Text>
                <Ionicons name="play-circle" size={24} color="#FFF" />
              </>
            )}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.orangeDim,
    justifyContent: "center",
    alignItems: "center",
  },
  brandName: {
    fontSize: 20,
    fontWeight: "700",
    color: C.textPrimary,
    letterSpacing: 0.5,
  },
  recBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,59,48,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recBadgePaused: {
    backgroundColor: "rgba(255,159,10,0.12)",
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.red,
  },
  recDotPaused: {
    backgroundColor: "#FF9F0A",
  },
  recText: {
    fontSize: 12,
    fontWeight: "700",
    color: C.red,
    letterSpacing: 1,
  },
  recTextPaused: {
    color: "#FF9F0A",
  },

  gaugeWrapper: {
    alignItems: "center",
    paddingVertical: 20,
  },
  gaugeContainer: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  gaugeSvg: {
    position: "absolute",
  },
  speedDisplay: {
    alignItems: "center",
  },
  speedValue: {
    fontSize: 72,
    fontWeight: "200",
    color: C.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  speedUnit: {
    fontSize: 16,
    fontWeight: "500",
    color: C.textSecondary,
    letterSpacing: 2,
    marginTop: -4,
  },
  scaleMin: {
    position: "absolute",
    bottom: 30,
    left: 30,
    fontSize: 12,
    color: C.textMuted,
    fontWeight: "500",
  },
  scaleMax: {
    position: "absolute",
    bottom: 30,
    right: 30,
    fontSize: 12,
    color: C.textMuted,
    fontWeight: "500",
  },

  statsRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingVertical: 20,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "600",
    color: C.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: "500",
  },
  statDivider: {
    width: 1,
    backgroundColor: C.cardBorder,
  },

  currentRide: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  currentRideLeft: {
    gap: 4,
  },
  currentRideTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: C.textPrimary,
  },
  currentRideMeta: {
    fontSize: 13,
    color: C.textSecondary,
  },
  currentRideLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
  },
  liveDotPaused: {
    backgroundColor: "#FF9F0A",
  },
  liveText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.green,
    letterSpacing: 0.5,
  },
  liveTextPaused: {
    color: "#FF9F0A",
  },

  bottomSection: {
    marginTop: "auto",
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  errorText: {
    color: C.red,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 4,
  },
  mainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 16,
  },
  mainBtnStart: {
    backgroundColor: C.orange,
  },
  mainBtnStop: {
    backgroundColor: C.red,
    flex: 1,
  },
  mainBtnPause: {
    backgroundColor: "#636366",
    flex: 1,
  },
  activeButtons: {
    flexDirection: "row",
    gap: 10,
  },
  mainBtnDisabled: {
    opacity: 0.5,
  },
  mainBtnText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
