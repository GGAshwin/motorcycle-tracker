/**
 * MotoTrack – Background Tracking Task
 *
 * Architecture overview
 * ─────────────────────
 * Expo's background location task executes on the JS thread.
 *
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │  JS Thread                                                  │
 *  │                                                             │
 *  │  REGISTERED_TRACKING_TASK (fired by OS on each GPS fix)     │
 *  │    → accumulates distance (speed-gated Haversine)           │
 *  │    → pushes one PendingPoint into pendingPoints[]           │
 *  │    → updates liveState.speed for UI subscribers             │
 *  │                                                             │
 *  │  setInterval flush (every 10 s)                             │
 *  │    → bulk-inserts pendingPoints[] in a single transaction   │
 *  │    → updates trips.total_dist                               │
 *  └─────────────────────────────────────────────────────────────┘
 *
 * IMPORTANT: TaskManager.defineTask() MUST be called at module top-level
 * (not inside a function or component) so Expo can find it during the
 * background task headless launch.
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { eq } from 'drizzle-orm';

import { getDb, getRawDb, initDatabase } from '../db/client';
import { trips, telemetryPoints } from '../db/schema';

// ── Constants ─────────────────────────────────────────────────────────────────

export const TRACKING_TASK_NAME = 'REGISTERED_TRACKING_TASK';

/** How often the batch is flushed to SQLite (milliseconds). */
const FLUSH_INTERVAL_MS = 10_000;

/** Maximum pending points before an emergency flush is forced. */
const EMERGENCY_FLUSH_THRESHOLD = 150;

/**
 * Minimum GPS speed (m/s) required before a fix contributes to total distance.
 * GPS-reported speed is Doppler-based and accurate even when position is noisy.
 * 0.5 m/s ≈ 1.8 km/h — filters out GPS drift while stationary or walking,
 * while capturing all real riding including slow traffic.
 */
const MIN_MOVING_SPEED_MS = 0.5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingPoint {
  tripId: number;
  lat: number;
  lon: number;
  alt: number | null;
  speed: number | null;
  timestamp: number; // Unix ms
}

export interface LiveRideState {
  /** Speed in m/s from GPS. */
  speed: number;
  /** Accumulated trip distance in metres. */
  distance: number;
  /** Whether a trip is actively being recorded. */
  isRecording: boolean;
  currentTripId: number | null;
}

// ── Module-level shared state ─────────────────────────────────────────────────

let pendingPoints: PendingPoint[] = [];
let currentTripId: number | null = null;
let tripDistMetres = 0;
let lastCoord: { lat: number; lon: number } | null = null;

let batchFlushTimer: ReturnType<typeof setInterval> | null = null;

let liveState: LiveRideState = {
  speed: 0,
  distance: 0,
  isRecording: false,
  currentTripId: null,
};

// Listeners registered by useCurrentRide hook(s).
const stateListeners = new Set<(s: LiveRideState) => void>();

function emit(patch: Partial<LiveRideState>): void {
  liveState = { ...liveState, ...patch };
  stateListeners.forEach((fn) => fn(liveState));
}

/**
 * Subscribe to live ride state changes.
 * Returns an unsubscribe function — call it in the hook's cleanup effect.
 */
export function subscribeToLiveState(
  listener: (s: LiveRideState) => void
): () => void {
  stateListeners.add(listener);
  listener(liveState); // immediate emit of current state
  return () => stateListeners.delete(listener);
}

// ── Haversine distance ────────────────────────────────────────────────────────

function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Batch flush ───────────────────────────────────────────────────────────────

async function flushBatch(): Promise<void> {
  if (pendingPoints.length === 0) return;

  const batch = pendingPoints.splice(0, pendingPoints.length);

  try {
    await getDb().insert(telemetryPoints).values(
      batch.map((p) => ({
        tripId:    p.tripId,
        lat:       p.lat,
        lon:       p.lon,
        alt:       p.alt   ?? undefined,
        speed:     p.speed ?? undefined,
        timestamp: p.timestamp,
      }))
    );

    if (currentTripId !== null) {
      await getDb()
        .update(trips)
        .set({ totalDist: tripDistMetres })
        .where(eq(trips.id, currentTripId));
    }
  } catch (err) {
    console.error('[MotoTrack] flushBatch error:', err);
    // Re-queue only if the buffer hasn't grown dangerously large.
    if (pendingPoints.length < EMERGENCY_FLUSH_THRESHOLD) {
      pendingPoints.unshift(...batch);
    }
  }
}

// ── Task definition (MUST be at module top level) ─────────────────────────────

TaskManager.defineTask(
  TRACKING_TASK_NAME,
  async ({
    data,
    error,
  }: TaskManager.TaskManagerTaskBody<{
    locations: Location.LocationObject[];
  }>) => {
    if (error) {
      console.error('[MotoTrack] Task error:', error.message);
      return;
    }
    if (!data?.locations?.length || currentTripId === null) return;

    for (const loc of data.locations) {
      const { latitude: lat, longitude: lon, altitude: alt, speed } =
        loc.coords;

      // Accumulate trip distance using Haversine, but only when the GPS
      // reports actual movement. GPS position is noisy (~3-5 m per fix),
      // so standing still or walking would otherwise inflate the total.
      if (lastCoord && speed !== null && speed >= MIN_MOVING_SPEED_MS) {
        tripDistMetres += haversineMetres(
          lastCoord.lat, lastCoord.lon,
          lat, lon
        );
      }
      lastCoord = { lat, lon };

      pendingPoints.push({
        tripId:    currentTripId,
        lat,
        lon,
        alt:       alt   ?? null,
        speed:     speed ?? null,
        timestamp: loc.timestamp,
      });

      emit({ speed: speed ?? 0, distance: tripDistMetres });

      // Safety valve: flush immediately if buffer grows unexpectedly large.
      if (pendingPoints.length >= EMERGENCY_FLUSH_THRESHOLD) {
        await flushBatch();
      }
    }
  }
);

// ── Trip lifecycle ────────────────────────────────────────────────────────────

/**
 * Creates a new trip record, starts the periodic batch flush, and begins
 * background location updates.
 *
 * @throws If foreground location permission is not granted.
 * @returns The new trip's database ID.
 */
export async function startTrip(): Promise<number> {
  initDatabase();

  // Android requires foreground permission before background can even be asked.
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    throw new Error('Location permission is required to record rides.');
  }

  // Background permission is best-effort: grants location when screen is off.
  // Falls back to foreground-service-only if denied (works in Expo Go).
  let backgroundGranted = false;
  try {
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    backgroundGranted = bgStatus === 'granted';
  } catch {
    // requestBackgroundPermissionsAsync can throw on some Expo Go builds.
  }

  const now = Date.now();

  const result = getRawDb().runSync(
    'INSERT INTO trips (date, start_time, total_dist) VALUES (?, ?, 0)',
    [now, now]
  );
  const newTripId = result.lastInsertRowId;

  if (!newTripId) throw new Error('[MotoTrack] Failed to create trip record');

  currentTripId  = newTripId;
  tripDistMetres = 0;
  lastCoord      = null;
  pendingPoints  = [];

  batchFlushTimer = setInterval(flushBatch, FLUSH_INTERVAL_MS);

  await Location.startLocationUpdatesAsync(TRACKING_TASK_NAME, {
    accuracy:          Location.Accuracy.BestForNavigation,
    timeInterval:      1000,
    distanceInterval:  0,
    showsBackgroundLocationIndicator: backgroundGranted,
    foregroundService: {
      notificationTitle: 'MotoTrack – Recording',
      notificationBody:  'Tap to return to the app.',
      notificationColor: '#FF6B00',
    },
  });

  emit({ isRecording: true, currentTripId: newTripId });
  return newTripId;
}

/**
 * Stops GPS updates, performs a final flush, and marks the trip as ended.
 */
export async function stopTrip(): Promise<void> {
  if (currentTripId === null) return;

  await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);

  if (batchFlushTimer) {
    clearInterval(batchFlushTimer);
    batchFlushTimer = null;
  }

  await flushBatch();

  await getDb()
    .update(trips)
    .set({ endTime: Date.now(), totalDist: tripDistMetres })
    .where(eq(trips.id, currentTripId));

  currentTripId  = null;
  tripDistMetres = 0;
  lastCoord      = null;

  emit({ isRecording: false, currentTripId: null, speed: 0, distance: 0 });
}
