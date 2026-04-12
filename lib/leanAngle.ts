/**
 * MotoTrack – Lean Angle Engine
 *
 * Physics
 * ───────
 * DeviceMotion provides `accelerationIncludingGravity` [x, y, z] in the phone's
 * own coordinate frame (units: m/s², range ≈ ±9.8 when stationary):
 *
 *   Portrait phone, screen facing you:
 *     g_x – points right  (positive)
 *     g_y – points up     (positive)
 *     g_z – points toward you out of the screen (positive)
 *
 * When the phone (and bike) roll to the right, gravity rotates in the Y-Z
 * plane, so:
 *
 *   θ = arctan2(g_y, g_z)          ← raw lean angle in radians
 *
 * At upright (θ ≈ 0): g_y ≈ 0, g_z ≈ −1 (gravity pulls toward Earth,
 * which is "into" the screen when holding portrait). We subtract a
 * calibration offset measured while the bike is stationary and vertical.
 *
 * Mounting orientations
 * ─────────────────────
 * Riders commonly mount phones in landscape mode. We rotate the effective
 * g_y / g_z axes accordingly before computing θ.
 *
 *  portrait        (default) – no rotation
 *  landscape-left  – phone rotated 90° CCW:  g_y' = −g_x, g_z' = g_z
 *  landscape-right – phone rotated 90° CW:   g_y' =  g_x, g_z' = g_z
 *
 * Calibration
 * ───────────
 * Place the bike on flat ground and upright, then call `calibrate()` with
 * the current gravity sample. This stores the raw angle as an offset that
 * is subtracted from all subsequent readings.  The calibration is in-memory
 * only; persist it via AsyncStorage / SecureStore if you need it across
 * app restarts.
 */

export type MountOrientation =
  | 'portrait'
  | 'landscape-left'
  | 'landscape-right';

export interface CalibrationState {
  /** Offset in radians subtracted from every raw measurement. */
  offset: number;
  orientation: MountOrientation;
}

// Module-level calibration state (shared across all callers in the JS thread).
let cal: CalibrationState = {
  offset: 0,
  orientation: 'portrait',
};

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Rotates the raw gravity vector into the lean plane based on how the phone
 * is mounted on the handlebars.
 */
function effectiveGravity(
  gx: number,
  gy: number,
  gz: number,
  orientation: MountOrientation
): { gy: number; gz: number } {
  switch (orientation) {
    case 'landscape-left':
      return { gy: -gx, gz };
    case 'landscape-right':
      return { gy: gx, gz };
    case 'portrait':
    default:
      return { gy, gz };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Computes calibrated lean angle in **degrees** from a single gravity sample.
 *
 * @param gx  DeviceMotion gravity.x
 * @param gy  DeviceMotion gravity.y
 * @param gz  DeviceMotion gravity.z
 * @returns   Degrees, positive = right lean, negative = left lean.
 *            Range is theoretically ±180°, but a motorcycle maxes out ~65°.
 */
export function calculateLeanAngle(
  gx: number,
  gy: number,
  gz: number
): number {
  const { gy: ey, gz: ez } = effectiveGravity(gx, gy, gz, cal.orientation);
  const rawRad = Math.atan2(ey, ez);
  const calibratedRad = rawRad - cal.offset;
  return calibratedRad * (180 / Math.PI);
}

/**
 * Records the current gravity reading as the "upright" reference point.
 * Call this while the bike is standing vertically on level ground.
 *
 * @param gx          Current DeviceMotion gravity.x
 * @param gy          Current DeviceMotion gravity.y
 * @param gz          Current DeviceMotion gravity.z
 * @param orientation Phone mounting orientation (default: 'portrait')
 */
export function calibrate(
  gx: number,
  gy: number,
  gz: number,
  orientation: MountOrientation = 'portrait'
): void {
  cal.orientation = orientation;
  const { gy: ey, gz: ez } = effectiveGravity(gx, gy, gz, orientation);
  cal.offset = Math.atan2(ey, ez);
}

/** Directly overwrite calibration (useful for restoring persisted state). */
export function setCalibration(state: CalibrationState): void {
  cal = { ...state };
}

/** Returns a copy of the current calibration for persistence. */
export function getCalibration(): CalibrationState {
  return { ...cal };
}

/**
 * Returns true if the lean angle magnitude exceeds a threshold that
 * typically indicates the phone is not mounted correctly or the bike fell.
 * Use this to surface a UI warning.
 */
export function isLeanAngleSuspicious(degrees: number): boolean {
  return Math.abs(degrees) > 75;
}
