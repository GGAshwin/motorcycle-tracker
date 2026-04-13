/**
 * MotoTrack – SQLite client
 *
 * All native calls are deferred inside initDatabase() so nothing runs at
 * module-evaluation time.  Calling openDatabaseSync / execSync before React
 * Native's native modules are fully ready (which can happen when the module
 * is imported as a side-effect at bundle root) silently kills the JS runtime
 * and produces the Expo Go blue-screen with no Metro error output.
 */

import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

// Lazily populated on first initDatabase() call.
let raw: SQLite.SQLiteDatabase | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** Returns the Drizzle instance. Throws if initDatabase() has not been called. */
export function getDb() {
  if (!_db) throw new Error('[MotoTrack] DB not initialised – call initDatabase() first');
  return _db;
}

/** Returns the raw expo-sqlite handle for low-level calls (e.g. last_insert_rowid). */
export function getRawDb() {
  if (!raw) throw new Error('[MotoTrack] DB not initialised – call initDatabase() first');
  return raw;
}

/**
 * Opens the database, applies performance PRAGMAs, and creates tables.
 * Must be called once inside a React effect (not at module scope) before
 * any other DB function is used.  Idempotent – safe to call more than once.
 *
 * PRAGMAs:
 *   WAL mode       – reader and writer never block each other.
 *   synchronous=NORMAL – skips per-commit fsync; safe with WAL, 3-5× faster.
 *   cache_size=-8000   – 8 MB page cache in RAM.
 *   foreign_keys=ON    – enforce ON DELETE CASCADE.
 */
export function initDatabase(): void {
  if (raw) return; // already initialised

  raw = SQLite.openDatabaseSync('mototrack.db');

  raw.execSync('PRAGMA journal_mode = WAL');
  raw.execSync('PRAGMA synchronous  = NORMAL');
  raw.execSync('PRAGMA cache_size   = -8000');
  raw.execSync('PRAGMA foreign_keys = ON');

  // Each statement is its own call – Android's SQLite driver rejects
  // multi-statement strings passed to execSync.
  raw.execSync(
    `CREATE TABLE IF NOT EXISTS trips (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       date       INTEGER NOT NULL,
       start_time INTEGER NOT NULL,
       end_time   INTEGER,
       total_dist REAL    NOT NULL DEFAULT 0
     )`
  );
  raw.execSync(
    `CREATE TABLE IF NOT EXISTS telemetry_points (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       trip_id     INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
       lat         REAL    NOT NULL,
       lon         REAL    NOT NULL,
       alt         REAL,
       speed       REAL,
       timestamp   INTEGER NOT NULL
     )`
  );
  raw.execSync(
    `CREATE INDEX IF NOT EXISTS idx_tp_trip_id  ON telemetry_points(trip_id)`
  );
  raw.execSync(
    `CREATE INDEX IF NOT EXISTS idx_tp_timestamp ON telemetry_points(timestamp)`
  );

  _db = drizzle(raw, { schema });
}
