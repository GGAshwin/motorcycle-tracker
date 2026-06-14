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
  /** True while the active ride is paused. */
  isPaused: boolean;
  currentTripId: number | null;
  /** Creates a new trip and starts GPS recording. Throws on permission denial. */
  startRide: () => Promise<void>;
  /** Finalises the trip and stops GPS recording. */
  stopRide: () => Promise<void>;
  /** Pauses the trip and stops distance accumulation. */
  pauseRide: () => Promise<void>;
  /** Resumes the trip and starts a new route segment. */
  resumeRide: () => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCurrentRide(): UseCurrentRideReturn {
  const [state, setState] = useState<LiveRideState>({
    speed:         0,
    distance:      0,
    isRecording:   false,
    isPaused:      false,
    currentTripId: null,
  });

  useEffect(() => {
    return subscribeToLiveState((next) => setState(next));
  }, []);

  const startRide = useCallback(async () => {
    const { startTrip } = await import('../lib/trackingTask');
    await startTrip();
  }, []);

  const stopRide = useCallback(async () => {
    const { stopTrip } = await import('../lib/trackingTask');
    await stopTrip();
  }, []);

  const pauseRide = useCallback(async () => {
    const { pauseTrip } = await import('../lib/trackingTask');
    await pauseTrip();
  }, []);

  const resumeRide = useCallback(async () => {
    const { resumeTrip } = await import('../lib/trackingTask');
    await resumeTrip();
  }, []);

  return {
    speed:         state.speed,
    speedKmh:      state.speed * 3.6,
    distance:      state.distance,
    isRecording:   state.isRecording,
    isPaused:      state.isPaused,
    currentTripId: state.currentTripId,
    startRide,
    stopRide,
    pauseRide,
    resumeRide,
  };
}
