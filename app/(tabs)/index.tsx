import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentRide } from '@/hooks/useCurrentRide';

const C = {
  bg:         '#0D0D0F',
  surface:    '#1C1C1E',
  border:     '#2C2C2E',
  orange:     '#FF6B00',
  red:        '#FF3B30',
  green:      '#30D158',
  textPrimary:   '#FFFFFF',
  textSecondary: '#8E8E93',
  textDim:       '#48484A',
} as const;

// ── Lean angle gauge ──────────────────────────────────────────────────────────

/**
 * Tilting horizon bar. The bar rotates in the opposite direction to lean so it
 * reads like a real horizon: lean right → bar tips left (ground rises on right).
 */
function LeanGauge({ angle }: { angle: number }) {
  const clamped = Math.max(-75, Math.min(75, angle));
  const isLeft  = clamped < -1;
  const isRight = clamped >  1;

  // Color zones: white < 30°, yellow 30-50°, orange > 50°
  const abs = Math.abs(clamped);
  const barColor =
    abs > 50 ? C.orange :
    abs > 30 ? '#FFD60A' :
    '#FFFFFF';

  return (
    <View style={styles.gaugeWrapper}>
      {/* Tick marks at 30° and 60° */}
      <View style={styles.gaugeBg}>
        {[-60, -30, 0, 30, 60].map((tick) => (
          <View
            key={tick}
            style={[
              styles.gaugeTick,
              tick === 0 && styles.gaugeTickCenter,
              { left: `${50 + (tick / 75) * 50}%` as any },
            ]}
          />
        ))}
      </View>

      {/* Rotating horizon bar */}
      <View style={styles.gaugeHorizonClip}>
        <View
          style={[
            styles.gaugeHorizon,
            { backgroundColor: barColor, transform: [{ rotate: `${-clamped}deg` }] },
          ]}
        />
      </View>

      {/* Angle label */}
      <View style={styles.gaugeLabelRow}>
        <Text style={[styles.gaugeDirText, { color: isLeft ? '#FFD60A' : C.textDim }]}>L</Text>
        <Text style={[styles.gaugeAngleText, { color: barColor }]}>
          {Math.abs(clamped).toFixed(1)}°
        </Text>
        <Text style={[styles.gaugeDirText, { color: isRight ? '#FFD60A' : C.textDim }]}>R</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RideScreen() {
  const {
    leanAngle,
    speedKmh,
    distance,
    isRecording,
    startRide,
    stopRide,
    calibrateSensor,
  } = useCurrentRide();

  const [loading, setLoading]   = useState(false);
  const [rideError, setRideError] = useState<string | null>(null);

  // Pulse animation for the recording dot
  const pulse = useRef(new Animated.Value(1)).current;
  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
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
      } else {
        await startRide();
        startPulse();
      }
    } catch (err) {
      pulse.stopAnimation();
      pulse.setValue(1);
      setRideError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [isRecording, startRide, stopRide, pulse, startPulse]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.appName}>MotoTrack</Text>
        {isRecording && (
          <View style={styles.recBadge}>
            <Animated.View style={[styles.recDot, { opacity: pulse }]} />
            <Text style={styles.recText}>REC</Text>
          </View>
        )}
      </View>

      {/* ── Lean angle gauge ── */}
      <LeanGauge angle={leanAngle} />

      {/* ── Speed ── */}
      <View style={styles.speedCard}>
        <Text style={styles.speedNumber}>
          {speedKmh < 1 ? '0' : speedKmh.toFixed(0)}
        </Text>
        <Text style={styles.speedUnit}>km/h</Text>
      </View>

      {/* ── Distance (only visible while recording) ── */}
      {isRecording && (
        <View style={styles.distanceRow}>
          <Text style={styles.distanceLabel}>DISTANCE</Text>
          <Text style={styles.distanceValue}>
            {distance < 1000
              ? `${Math.round(distance)} m`
              : `${(distance / 1000).toFixed(2)} km`}
          </Text>
        </View>
      )}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        {rideError && (
          <Text style={styles.errorText}>{rideError}</Text>
        )}

        <Pressable
          style={({ pressed }) => [styles.btnSecondary, pressed && styles.pressed]}
          onPress={() => calibrateSensor('portrait')}
          disabled={loading}
        >
          <Text style={styles.btnSecondaryText}>Calibrate (upright)</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.btnPrimary,
            isRecording && styles.btnStop,
            loading && styles.btnDisabled,
            pressed && !loading && styles.pressed,
          ]}
          onPress={handleToggle}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnPrimaryText}>
                {isRecording ? 'Stop Ride' : 'Start Ride'}
              </Text>
          }
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  appName: {
    color: C.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3A0A0A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.red,
  },
  recText: {
    color: C.red,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Lean gauge
  gaugeWrapper: {
    marginHorizontal: 24,
    marginTop: 24,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 12,
  },
  gaugeBg: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    height: 60,
    flexDirection: 'row',
  },
  gaugeTick: {
    position: 'absolute',
    width: 1,
    height: 12,
    backgroundColor: C.border,
    top: 24,
    marginLeft: -0.5,
  },
  gaugeTickCenter: {
    height: 20,
    top: 20,
    backgroundColor: C.textDim,
  },
  gaugeHorizonClip: {
    height: 60,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugeHorizon: {
    width: '130%',
    height: 3,
    borderRadius: 2,
  },
  gaugeLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gaugeDirText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
  gaugeAngleText: {
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // Speed
  speedCard: {
    marginHorizontal: 24,
    marginTop: 16,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 28,
    alignItems: 'center',
  },
  speedNumber: {
    color: C.textPrimary,
    fontSize: 80,
    fontWeight: '200',
    lineHeight: 80,
    fontVariant: ['tabular-nums'],
  },
  speedUnit: {
    color: C.textSecondary,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 2,
    marginTop: 4,
  },

  // Actions
  actions: {
    marginHorizontal: 24,
    marginTop: 'auto',
    paddingBottom: 24,
    gap: 12,
  },
  btnPrimary: {
    backgroundColor: C.orange,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnStop: {
    backgroundColor: C.red,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  btnSecondary: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: C.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: C.red,
    fontSize: 13,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  distanceRow: {
    marginHorizontal: 24,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  distanceLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  distanceValue: {
    color: C.textPrimary,
    fontSize: 24,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
});
