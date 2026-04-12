/**
 * MotoTrack – Background Tracking Task
 *
 * Architecture overview
 * ─────────────────────
 * Expo's background location task and DeviceMotion sensor both execute on the
 * same JS thread, so we can share plain module-level variables between them
 * without any IPC or shared memory primitives.
 *
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │  JS Thread                                                  │
 *  │                                                             │
 *  │  DeviceMotion listener (50 Hz)                              │
 *  │    → pushes lean samples into leanAngleSamples[]            │
 *  │    → updates liveState for UI subscribers                   │
 *  │                                                             │
 *  │  REGISTERED_TRACKING_TASK (fired by OS on each GPS fix)     │
 *  │    → consumes + averages leanAngleSamples[] for the window  │
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
import { DeviceMotion } from 'expo-sensors';
import { eq } from 'drizzle-orm';

import { getDb, getRawDb, initDatabase } from '../db/client';
import { trips, telemetryPoints } from '../db/schema';
import { calculateLeanAngle } from './leanAngle';

// ── Constants ─────────────────────────────────────────────────────────────────

export const TRACKING_TASK_NAME = 'REGISTERED_TRACKING_TASK';

/** DeviceMotion polling interval in milliseconds (20 ms = 50 Hz). */
const MOTION_INTERVAL_MS = 20;

/** How often the batch is flushed to SQLite (milliseconds). */
const FLUSH_INTERVAL_MS = 10_000;

/** Maximum lean-angle ring buffer size (50 Hz × 4 s safety margin). */
const MAX_LEAN_SAMPLES = 200;

/** Maximum pending points before an emergency flush is forced. */
const EMERGENCY_FLUSH_THRESHOLD = 150;

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeanSample {
  angle: number;  // degrees
  ts: number;     // Date.now()
}

interface PendingPoint {
  tripId: number;
  lat: number;
  lon: number;
  alt: number | null;
  speed: number | null;
  leanAngle: number | null;
  timestamp: number; // Unix ms
}

export interface LiveRideState {
  /** Current lean angle in degrees (EMA-smoothed for UI). */
  leanAngle: number;
  /** Speed in m/s from GPS. */
  speed: number;
  /** Accumulated trip distance in metres. */
  distance: number;
  /** Whether a trip is actively being recorded. */
  isRecording: boolean;
  currentTripId: number | null;
}

// ── Module-level shared state ─────────────────────────────────────────────────

let leanAngleSamples: LeanSample[] = [];
let pendingPoints: PendingPoint[] = [];
let currentTripId: number | null = null;
let tripDistMetres = 0;
let lastCoord: { lat: number; lon: number } | null = null;

let batchFlushTimer: ReturnType<typeof setInterval> | null = null;
let motionSubscription: { remove: () => void } | null = null;

let liveState: LiveRideState = {
  leanAngle: 0,
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

// ── DeviceMotion (50 Hz) ──────────────────────────────────────────────────────

export function startMotionSampling(): void {
  DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);

  motionSubscription = DeviceMotion.addListener(({ accelerationIncludingGravity }) => {
    if (!accelerationIncludingGravity) return;

    const angle = calculateLeanAngle(
      accelerationIncludingGravity.x,
      accelerationIncludingGravity.y,
      accelerationIncludingGravity.z,
    );

    // Push into ring buffer, evict oldest if over cap.
    leanAngleSamples.push({ angle, ts: Date.now() });
    if (leanAngleSamples.length > MAX_LEAN_SAMPLES) {
      leanAngleSamples.shift();
    }

    emit({ leanAngle: angle });
  });
}

export function stopMotionSampling(): void {
  motionSubscription?.remove();
  motionSubscription = null;
  leanAngleSamples = [];
}

// ── Lean angle window consumer ────────────────────────────────────────────────

/**
 * Drains the sample buffer and returns the simple mean lean angle.
 * Returns null if no samples were collected (sensor unavailable).
 */
function consumeLeanWindow(): number | null {
  if (leanAngleSamples.length === 0) return null;
  const sum = leanAngleSamples.reduce((acc, s) => acc + s.angle, 0);
  const mean = sum / leanAngleSamples.length;
  leanAngleSamples = [];
  return mean;
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
        alt:       p.alt    ?? undefined,
        speed:     p.speed  ?? undefined,
        leanAngle: p.leanAngle ?? undefined,
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

      // Accumulate trip distance using Haversine.
      if (lastCoord) {
        tripDistMetres += haversineMetres(
          lastCoord.lat, lastCoord.lon,
          lat, lon
        );
      }
      lastCoord = { lat, lon };

      // Average all 50-Hz lean samples collected since the last GPS fix.
      const avgLean = consumeLeanWindow();

      pendingPoints.push({
        tripId:    currentTripId,
        lat,
        lon,
        alt:       alt   ?? null,
        speed:     speed ?? null,
        leanAngle: avgLean,
        timestamp: loc.timestamp,
      });

      emit({ speed: speed ?? 0, distance: tripDistMetres });

      // Safety valve: flush immediately if buffer grows unexpectedly large
      // (e.g., the interval timer was delayed by OS throttling).
      if (pendingPoints.length >= EMERGENCY_FLUSH_THRESHOLD) {
        await flushBatch();
      }
    }
  }
);

// ── Trip lifecycle ────────────────────────────────────────────────────────────

/**
 * Creates a new trip record, starts DeviceMotion sampling, starts the
 * periodic batch flush, and begins background location updates.
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

  // Use runSync so lastInsertRowId is available synchronously without needing
  // a follow-up SELECT.  Avoids the async/sync ordering hazard of getFirstSync
  // racing against an awaited drizzle insert.
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

  startMotionSampling();

  batchFlushTimer = setInterval(flushBatch, FLUSH_INTERVAL_MS);

  await Location.startLocationUpdatesAsync(TRACKING_TASK_NAME, {
    accuracy:          Location.Accuracy.BestForNavigation,
    timeInterval:      1000,
    distanceInterval:  0,
    showsBackgroundLocationIndicator: backgroundGranted,
    foregroundService: {
      // Foreground service keeps tracking alive when the screen dims.
      // Works with foreground permission alone; background permission
      // additionally tracks when the app is fully killed.
      notificationTitle: 'MotoTrack – Recording',
      notificationBody:  'Tap to return to the app.',
      notificationColor: '#FF6B00',
    },
  });

  emit({ isRecording: true, currentTripId: newTripId });
  return newTripId;
}

/**
 * Stops GPS updates, stops motion sampling, performs a final flush, and
 * marks the trip as ended with its final distance.
 */
export async function stopTrip(): Promise<void> {
  if (currentTripId === null) return;

  await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);

  stopMotionSampling();

  if (batchFlushTimer) {
    clearInterval(batchFlushTimer);
    batchFlushTimer = null;
  }

  // Final flush of any buffered points.
  await flushBatch();

  await getDb()
    .update(trips)
    .set({ endTime: Date.now(), totalDist: tripDistMetres })
    .where(eq(trips.id, currentTripId));

  currentTripId  = null;
  tripDistMetres = 0;
  lastCoord      = null;

  emit({ isRecording: false, currentTripId: null, leanAngle: 0, speed: 0, distance: 0 });
}
