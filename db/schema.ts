/**
 * MotoTrack – Drizzle/SQLite Schema
 *
 * Two tables with a strict 1-to-many relationship:
 *   trips            – one row per recording session
 *   telemetry_points – high-frequency sensor rows, FK → trips
 *
 * Integer timestamps are stored as Unix epoch milliseconds so SQLite
 * arithmetic (duration, filtering by date) stays fast with no string parsing.
 */

import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ── trips ────────────────────────────────────────────────────────────────────

export const trips = sqliteTable('trips', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  /** Wall-clock date the ride began, stored as Unix ms. */
  date:       integer('date').notNull(),
  /** Milliseconds since epoch – ride start. */
  startTime:  integer('start_time').notNull(),
  /** Milliseconds since epoch – ride end (NULL while recording). */
  endTime:    integer('end_time'),
  /** Accumulated Haversine distance in metres. */
  totalDist:  real('total_dist').notNull().default(0),
  /** Sync status flag for Supabase local-first sync. */
  isSynced:   integer('is_synced', { mode: 'boolean' }).notNull().default(false),
  /** Public visibility flag for community community routes. */
  isPublic:   integer('is_public', { mode: 'boolean' }).notNull().default(false),
});

// ── telemetry_points ─────────────────────────────────────────────────────────

export const telemetryPoints = sqliteTable('telemetry_points', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  tripId:     integer('trip_id')
                .notNull()
                .references(() => trips.id, { onDelete: 'cascade' }),
  lat:        real('lat').notNull(),
  lon:        real('lon').notNull(),
  /** Altitude in metres (may be null if GPS fix is 2D). */
  alt:        real('alt'),
  /** Speed in m/s as reported by the GPS chipset. */
  speed:      real('speed'),
  /** Unix ms timestamp from the GPS fix. */
  timestamp:  integer('timestamp').notNull(),
});

// ── waypoints ────────────────────────────────────────────────────────────────

export const waypoints = sqliteTable('waypoints', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  tripId:     integer('trip_id')
                .notNull()
                .references(() => trips.id, { onDelete: 'cascade' }),
  lat:        real('lat').notNull(),
  lon:        real('lon').notNull(),
  type:       integer('type').notNull(), // e.g. 1 for hazard, 2 for viewpoint
  imageUrl:   text('image_url'),
  timestamp:  integer('timestamp').notNull(),
  isSynced:   integer('is_synced', { mode: 'boolean' }).notNull().default(false),
});

// ── Relations (used by Drizzle's relational query API) ────────────────────────

export const tripsRelations = relations(trips, ({ many }) => ({
  points: many(telemetryPoints),
  waypoints: many(waypoints),
}));

export const telemetryPointsRelations = relations(
  telemetryPoints,
  ({ one }) => ({
    trip: one(trips, {
      fields: [telemetryPoints.tripId],
      references: [trips.id],
    }),
  })
);

export const waypointsRelations = relations(
  waypoints,
  ({ one }) => ({
    trip: one(trips, {
      fields: [waypoints.tripId],
      references: [trips.id],
    }),
  })
);

// ── Inferred TypeScript types ─────────────────────────────────────────────────

export type Trip           = typeof trips.$inferSelect;
export type NewTrip        = typeof trips.$inferInsert;
export type TelemetryPoint = typeof telemetryPoints.$inferSelect;
export type NewTelemetryPoint = typeof telemetryPoints.$inferInsert;
export type Waypoint       = typeof waypoints.$inferSelect;
export type NewWaypoint    = typeof waypoints.$inferInsert;
