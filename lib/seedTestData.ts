/**
 * Dev utility — inserts one fake trip with GPS telemetry points so the map
 * screen can be tested indoors without a real ride.
 *
 * Route: a ~900 m S-curve in Pune, MH, India.
 * Lean angles are varied to exercise all three colour zones on the map.
 * Remove this file (and its button in explore.tsx) before shipping.
 */

import { getDb, getRawDb } from '../db/client';
import { telemetryPoints } from '../db/schema';

// ── Fake route data ────────────────────────────────────────────────────────────
// lat/lon coordinates along a realistic S-bend, speed in m/s, lean in degrees.

const ROUTE: { lat: number; lon: number; speed: number; lean: number }[] = [
  { lat: 13.38125, lon: 77.69742, speed: 45, lean: 0 }, // Approaching curve
  { lat: 13.38148, lon: 77.69735, speed: 40, lean: 0 },
  { lat: 13.38175, lon: 77.69715, speed: 35, lean: 0 },
  { lat: 13.38198, lon: 77.69685, speed: 28, lean: 0 }, // Entering tight hairpin
  { lat: 13.38205, lon: 77.69655, speed: 22, lean: 0 }, // Apex of hairpin
  { lat: 13.38195, lon: 77.69625, speed: 25, lean: 0 }, // Exiting hairpin
  { lat: 13.38172, lon: 77.69605, speed: 32, lean: 0 },
  { lat: 13.38145, lon: 77.69595, speed: 38, lean: 0 },
  { lat: 13.38115, lon: 77.69592, speed: 42, lean: 0 }, // Short straight
  { lat: 13.38085, lon: 77.69598, speed: 45, lean: 0 },
  { lat: 13.38055, lon: 77.69615, speed: 40, lean: 0 }, // Starting next curve
  { lat: 13.38032, lon: 77.69642, speed: 35, lean: 0 },
  { lat: 13.38015, lon: 77.69675, speed: 30, lean: 0 }, // Apex
  { lat: 13.38012, lon: 77.70112, speed: 35, lean: 0 }  // Straightening out
];

const TOTAL_DIST_M = 920; // approximate Haversine total for this path

// ── Seed function ─────────────────────────────────────────────────────────────

export async function seedTestRide(): Promise<number> {
  const now       = Date.now();
  const startTime = now - ROUTE.length * 1000; // pretend the ride ended just now

  // Insert the trip row synchronously so we get the ID immediately.
  const result = getRawDb().runSync(
    'INSERT INTO trips (date, start_time, end_time, total_dist) VALUES (?, ?, ?, ?)',
    [startTime, startTime, now, TOTAL_DIST_M],
  );
  const tripId = result.lastInsertRowId as number;
  if (!tripId) throw new Error('[seed] Failed to insert test trip');

  // Bulk-insert telemetry points.
  await getDb().insert(telemetryPoints).values(
    ROUTE.map((p, i) => ({
      tripId,
      lat:       p.lat,
      lon:       p.lon,
      alt:       580,          // Pune elevation ~580 m
      speed:     p.speed,
      leanAngle: p.lean,
      timestamp: startTime + i * 1000,
    })),
  );

  return tripId;
}
