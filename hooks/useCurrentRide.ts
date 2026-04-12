/**
 * MotoTrack – useCurrentRide hook
 *
 * Provides the UI with real-time telemetry values (lean angle, speed) sourced
 * directly from the sensor stream via the pub/sub channel in trackingTask.ts.
 *
 * The background task writes to SQLite; this hook never touches the database.
 * The two concerns are intentionally separated:
 *   - High-frequency UI updates  → this hook (in-memory state, no I/O)
 *   - Durable persistence        → trackingTask batch flush (disk, 10 s cadence)
 *
 * EMA smoothing
 * ─────────────
 * Raw lean angle from arctan2 is noisy. An Exponential Moving Average with
 * α ≈ 0.25 smooths out single-sample spikes while keeping ~200 ms of lag —
 * imperceptible to a rider glancing at a gauge.
 *
 *   smoothed_t = α × raw_t + (1 − α) × smoothed_{t−1}
 *
 * Calibration
 * ───────────
 * calibrateSensor() captures one live DeviceMotion reading by subscribing
 * for a single tick, then immediately unsubscribes. Safe to call while the
 * main tracking subscription is already running.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceMotion } from 'expo-sensors';
import type { MountOrientation } from '../lib/leanAngle';
import { calibrate } from '../lib/leanAngle';
import {
  LiveRideState,
  startTrip,
  stopTrip,
  subscribeToLiveState,
} from '../lib/trackingTask';

// ── EMA alpha – tune for smoothness vs. responsiveness ───────────────────────
const EMA_ALPHA = 0.25;

// ── Public hook interface ─────────────────────────────────────────────────────

export interface UseCurrentRideReturn {
  /** Calibrated lean angle in degrees (positive = right lean). EMA-smoothed. */
  leanAngle: number;
  /** Absolute lean angle – useful for a symmetric gauge arc. */
  absLeanAngle: number;
  /** Distance travelled this ride in metres. */
  distance: number;
  /** Speed in m/s from the GPS chipset. */
  speed: number;
  /** Speed in km/h (derived). */
  speedKmh: number;
  /** True while location + motion recording is active. */
  isRecording: boolean;
  currentTripId: number | null;
  /** Creates a new trip and starts all sensors. Throws on permission denial. */
  startRide: () => Promise<void>;
  /** Finalises the trip and stops all sensors. */
  stopRide: () => Promise<void>;
  /**
   * Captures the current gravity vector as the upright reference point.
   * Bike must be stationary and vertical when called.
   *
   * @param orientation  How the phone is mounted (default: 'portrait').
   */
  calibrateSensor: (orientation?: MountOrientation) => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCurrentRide(): UseCurrentRideReturn {
  const [state, setState] = useState<LiveRideState>({
    leanAngle:     0,
    speed:         0,
    distance:      0,
    isRecording:   false,
    currentTripId: null,
  });

  // EMA accumulator lives in a ref so it persists across renders without
  // causing extra re-renders itself.
  const smoothedLean = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeToLiveState((next) => {
      // Apply EMA to lean angle before updating component state.
      smoothedLean.current =
        EMA_ALPHA * next.leanAngle + (1 - EMA_ALPHA) * smoothedLean.current;

      setState({
        ...next,
        leanAngle: smoothedLean.current,
      });
    });

    return unsubscribe;
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const startRide = useCallback(async () => {
    await startTrip();
  }, []);

  const stopRide = useCallback(async () => {
    await stopTrip();
  }, []);

  /**
   * Subscribes to DeviceMotion for exactly one reading, uses it to set the
   * calibration offset, then removes the one-shot subscription.
   */
  const calibrateSensor = useCallback(
    (orientation: MountOrientation = 'portrait') => {
      DeviceMotion.setUpdateInterval(20);

      // One-shot subscription: capture one gravity sample then unsubscribe.
      const sub = DeviceMotion.addListener(({ accelerationIncludingGravity }) => {
        if (!accelerationIncludingGravity) return;
        calibrate(
          accelerationIncludingGravity.x,
          accelerationIncludingGravity.y,
          accelerationIncludingGravity.z,
          orientation,
        );
        // Reset the EMA accumulator so the gauge doesn't jump.
        smoothedLean.current = 0;
        sub.remove();
      });
    },
    []
  );

  // ── Derived values ─────────────────────────────────────────────────────────

  return {
    leanAngle:     state.leanAngle,
    absLeanAngle:  Math.abs(state.leanAngle),
    speed:         state.speed,
    speedKmh:      state.speed * 3.6,
    distance:      state.distance,
    isRecording:   state.isRecording,
    currentTripId: state.currentTripId,
    startRide,
    stopRide,
    calibrateSensor,
  };
}
