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
 *  │    → auto-pauses after AUTO_PAUSE_MS of no movement         │
 *  │    → auto-resumes when movement is detected again           │
 *  │                                                             │
 *  │  setInterval flush (every 10 s)                             │
 *  │    → bulk-inserts pendingPoints[] in a single transaction   │
 *  │    → updates trips.total_dist                               │
 *  └─────────────────────────────────────────────────────────────┘
 *
 * Pause types
 * ───────────
 *  Manual pause  – GPS stops entirely (battery saving). User must resume.
 *  Auto-pause    – GPS keeps running (so movement can be detected).
 *                  Points are silently dropped until movement resumes.
 *
 * IMPORTANT: TaskManager.defineTask() MUST be called at module top-level
 * (not inside a function or component) so Expo can find it during the
 * background task headless launch.
 */

import { eq } from "drizzle-orm";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { getDb, getRawDb, initDatabase } from "../db/client";
import { telemetryPoints, trips } from "../db/schema";

// ── Constants ─────────────────────────────────────────────────────────────────

export const TRACKING_TASK_NAME = "REGISTERED_TRACKING_TASK";

const FLUSH_INTERVAL_MS = 10_000;
const EMERGENCY_FLUSH_THRESHOLD = 150;
const MIN_POINTS_FOR_TIME_FLUSH = 5;

/**
 * Minimum GPS speed (m/s) required before a fix contributes to total distance.
 * 0.5 m/s ≈ 1.8 km/h — filters GPS drift while stationary.
 */
const MIN_MOVING_SPEED_MS = 0.5;

/** Stationary time before auto-pause triggers. */
const AUTO_PAUSE_MS = 15 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingPoint {
  tripId: number;
  lat: number;
  lon: number;
  alt: number | null;
  speed: number | null;
  timestamp: number;
}

export interface LiveRideState {
  speed: number;
  distance: number;
  isRecording: boolean;
  isPaused: boolean;
  /** True when the pause was triggered automatically (GPS still running). */
  isAutoPaused: boolean;
  currentTripId: number | null;
}

// ── Module-level shared state ─────────────────────────────────────────────────

let pendingPoints: PendingPoint[] = [];
let currentTripId: number | null = null;
let tripDistMetres = 0;
let lastCoord: { lat: number; lon: number } | null = null;
let lastFlushTime = 0;
let lastMovementTime = 0;
let isAutoPaused = false;
/** True when GPS was stopped by a manual pauseTrip() call. */
let gpsRunning = false;

let batchFlushTimer: ReturnType<typeof setInterval> | null = null;

let liveState: LiveRideState = {
  speed: 0,
  distance: 0,
  isRecording: false,
  isPaused: false,
  isAutoPaused: false,
  currentTripId: null,
};

const stateListeners = new Set<(s: LiveRideState) => void>();

function emit(patch: Partial<LiveRideState>): void {
  liveState = { ...liveState, ...patch };
  stateListeners.forEach((fn) => fn(liveState));
}

export function subscribeToLiveState(
  listener: (s: LiveRideState) => void,
): () => void {
  stateListeners.add(listener);
  listener(liveState);
  return () => stateListeners.delete(listener);
}

// ── Haversine distance ────────────────────────────────────────────────────────

function haversineMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Batch flush ───────────────────────────────────────────────────────────────

async function flushBatch(): Promise<void> {
  if (pendingPoints.length === 0) return;

  const batch = pendingPoints.splice(0, pendingPoints.length);

  try {
    await getDb()
      .insert(telemetryPoints)
      .values(
        batch.map((p) => ({
          tripId: p.tripId,
          lat: p.lat,
          lon: p.lon,
          alt: p.alt ?? undefined,
          speed: p.speed ?? undefined,
          timestamp: p.timestamp,
        })),
      );

    if (currentTripId !== null) {
      await getDb()
        .update(trips)
        .set({ totalDist: tripDistMetres })
        .where(eq(trips.id, currentTripId));
    }
  } catch (err) {
    console.error("[MotoTrack] flushBatch error:", err);
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
      console.error("[MotoTrack] Task error:", error.message);
      return;
    }
    if (!data?.locations?.length || currentTripId === null) return;

    try {
      initDatabase();
    } catch (e) {
      console.error("[MotoTrack] Background DB init failed:", e);
    }

    for (const loc of data.locations) {
      const {
        latitude: lat,
        longitude: lon,
        altitude: alt,
        speed,
      } = loc.coords;
      const isMoving = speed !== null && speed >= MIN_MOVING_SPEED_MS;

      // ── Auto-resume: movement detected while auto-paused ──────────────────
      if (isAutoPaused) {
        if (isMoving) {
          isAutoPaused = false;
          lastMovementTime = loc.timestamp;
          lastCoord = null; // fresh start — no phantom segment
          emit({ isPaused: false, isAutoPaused: false });
          // fall through to record this point normally
        } else {
          continue; // still stationary, skip point
        }
      }

      // ── Track last movement time ──────────────────────────────────────────
      if (isMoving) {
        lastMovementTime = loc.timestamp;
      }

      // ── Auto-pause: stationary for too long ───────────────────────────────
      if (
        lastMovementTime > 0 &&
        loc.timestamp - lastMovementTime > AUTO_PAUSE_MS
      ) {
        isAutoPaused = true;
        lastCoord = null; // clear so resume starts fresh
        await flushBatch();
        emit({ isPaused: true, isAutoPaused: true, speed: 0 });
        continue;
      }

      // ── Normal point recording ────────────────────────────────────────────
      if (lastCoord && isMoving) {
        tripDistMetres += haversineMetres(
          lastCoord.lat,
          lastCoord.lon,
          lat,
          lon,
        );
      }
      lastCoord = { lat, lon };

      pendingPoints.push({
        tripId: currentTripId,
        lat,
        lon,
        alt: alt ?? null,
        speed: speed ?? null,
        timestamp: loc.timestamp,
      });

      emit({ speed: speed ?? 0, distance: tripDistMetres });
    }

    const now = Date.now();
    const timeElapsed = now - lastFlushTime;
    const shouldFlush =
      pendingPoints.length >= EMERGENCY_FLUSH_THRESHOLD ||
      (timeElapsed >= FLUSH_INTERVAL_MS &&
        pendingPoints.length >= MIN_POINTS_FOR_TIME_FLUSH);

    if (shouldFlush) {
      await flushBatch();
      lastFlushTime = now;
    }
  },
);

// ── Trip lifecycle ────────────────────────────────────────────────────────────

export async function startTrip(): Promise<number> {
  initDatabase();

  const { status: fgStatus } =
    await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== "granted") {
    throw new Error("Location permission is required to record rides.");
  }

  let backgroundGranted = false;
  try {
    const { status: bgStatus } =
      await Location.requestBackgroundPermissionsAsync();
    backgroundGranted = bgStatus === "granted";
  } catch {
    // requestBackgroundPermissionsAsync can throw on some Expo Go builds.
  }

  const now = Date.now();

  const result = getRawDb().runSync(
    "INSERT INTO trips (date, start_time, total_dist) VALUES (?, ?, 0)",
    [now, now],
  );
  const newTripId = result.lastInsertRowId;

  if (!newTripId) throw new Error("[MotoTrack] Failed to create trip record");

  currentTripId = newTripId;
  tripDistMetres = 0;
  lastCoord = null;
  pendingPoints = [];
  lastFlushTime = now;
  lastMovementTime = now; // full window before first auto-pause check
  isAutoPaused = false;

  batchFlushTimer = setInterval(flushBatch, FLUSH_INTERVAL_MS);

  await Location.startLocationUpdatesAsync(TRACKING_TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    showsBackgroundLocationIndicator: backgroundGranted,
    foregroundService: {
      notificationTitle: "MotoTrack – Recording",
      notificationBody: "Tap to return to the app.",
      notificationColor: "#FF6B00",
    },
  });

  gpsRunning = true;
  emit({
    isRecording: true,
    isPaused: false,
    isAutoPaused: false,
    currentTripId: newTripId,
  });
  return newTripId;
}

export async function stopTrip(): Promise<void> {
  if (currentTripId === null) return;

  if (gpsRunning) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);
    gpsRunning = false;
  }

  if (batchFlushTimer) {
    clearInterval(batchFlushTimer);
    batchFlushTimer = null;
  }

  await flushBatch();

  await getDb()
    .update(trips)
    .set({ endTime: Date.now(), totalDist: tripDistMetres })
    .where(eq(trips.id, currentTripId));

  currentTripId = null;
  tripDistMetres = 0;
  lastCoord = null;
  lastMovementTime = 0;
  isAutoPaused = false;

  emit({
    isRecording: false,
    isPaused: false,
    isAutoPaused: false,
    currentTripId: null,
    speed: 0,
    distance: 0,
  });
}

/**
 * Manual pause — stops GPS entirely (saves battery).
 * User must explicitly resume; auto-resume does not apply.
 */
export async function pauseTrip(): Promise<void> {
  if (currentTripId === null || liveState.isPaused) return;

  if (gpsRunning) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);
    gpsRunning = false;
  }

  if (batchFlushTimer) {
    clearInterval(batchFlushTimer);
    batchFlushTimer = null;
  }

  await flushBatch();

  lastCoord = null;
  isAutoPaused = false;

  emit({ isPaused: true, isAutoPaused: false, speed: 0 });
}

/**
 * Resumes a paused trip (manual or auto).
 * GPS is only restarted if it was stopped (manual pause); after an
 * auto-pause GPS is already running so no restart is needed.
 */
export async function resumeTrip(): Promise<void> {
  if (currentTripId === null || !liveState.isPaused) return;

  lastCoord = null; // fresh start — no phantom segment
  lastMovementTime = Date.now(); // reset window so auto-pause doesn't fire immediately
  isAutoPaused = false;

  if (!gpsRunning) {
    lastFlushTime = Date.now();
    batchFlushTimer = setInterval(flushBatch, FLUSH_INTERVAL_MS);

    await Location.startLocationUpdatesAsync(TRACKING_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "MotoTrack – Recording",
        notificationBody: "Tap to return to the app.",
        notificationColor: "#FF6B00",
      },
    });

    gpsRunning = true;
  }

  emit({ isPaused: false, isAutoPaused: false });
}
