/**
 * MotoTrack – useCurrentRide hook
 *
 * Provides the UI with real-time telemetry values (speed, distance) sourced
 * directly from the GPS stream via the pub/sub channel in trackingTask.ts.
 *
 * The background task writes to SQLite; this hook never touches the database.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  LiveRideState,
  startTrip,
  stopTrip,
  subscribeToLiveState,
} from '../lib/trackingTask';

// ── Public hook interface ─────────────────────────────────────────────────────

export interface UseCurrentRideReturn {
  /** Distance travelled this ride in metres. */
  distance: number;
  /** Speed in m/s from the GPS chipset. */
  speed: number;
  /** Speed in km/h (derived). */
  speedKmh: number;
  /** True while location recording is active. */
  isRecording: boolean;
  currentTripId: number | null;
  /** Creates a new trip and starts GPS recording. Throws on permission denial. */
  startRide: () => Promise<void>;
  /** Finalises the trip and stops GPS recording. */
  stopRide: () => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCurrentRide(): UseCurrentRideReturn {
  const [state, setState] = useState<LiveRideState>({
    speed:         0,
    distance:      0,
    isRecording:   false,
    currentTripId: null,
  });

  useEffect(() => {
    return subscribeToLiveState((next) => setState(next));
  }, []);

  const startRide = useCallback(async () => {
    await startTrip();
  }, []);

  const stopRide = useCallback(async () => {
    await stopTrip();
  }, []);

  return {
    speed:         state.speed,
    speedKmh:      state.speed * 3.6,
    distance:      state.distance,
    isRecording:   state.isRecording,
    currentTripId: state.currentTripId,
    startRide,
    stopRide,
  };
}
