import { getDb } from '../db/client';
import { trips, telemetryPoints, waypoints } from '../db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { supabase } from './supabase';
import * as SecureStore from 'expo-secure-store';

/**
 * Pushes any local records (trips, telemetry, waypoints) that have
 * isSynced = false to the Supabase cloud.
 */
export async function pushLocalDataToCloud() {
  const db = getDb();
  
  const username = await SecureStore.getItemAsync('moto_username');
  if (!username) {
    console.log('[Sync] No username found, skipping sync.');
    return;
  }

  // 1. Fetch unsynced trips
  const unsyncedTrips = await db.select().from(trips).where(eq(trips.isSynced, false));
  
  for (const trip of unsyncedTrips) {
    try {
      // Create trip in Supabase
      const { data: remoteTrip, error: tripEx } = await supabase.from('trips').insert({
        username: username,
        local_id: trip.id,
        date: trip.date,
        start_time: trip.startTime,
        end_time: trip.endTime,
        total_dist: trip.totalDist,
        is_public: trip.isPublic,
      }).select().single();

      if (tripEx) {
        console.error('[Sync] Error syncing trip:', tripEx);
        continue;
      }

      // Fetch all telemetry for this trip
      const points = await db.select().from(telemetryPoints).where(eq(telemetryPoints.tripId, trip.id));
      
      // Batch insert telemetry
      if (points.length > 0) {
        // chunking inserts if there are too many (e.g. >1000)
        const CHUNK_SIZE = 500;
        for (let i = 0; i < points.length; i += CHUNK_SIZE) {
          const chunk = points.slice(i, i + CHUNK_SIZE).map(pt => ({
            trip_id: remoteTrip.id,
            username: username,
            lat: pt.lat,
            lon: pt.lon,
            alt: pt.alt,
            speed: pt.speed,
            timestamp: pt.timestamp
          }));
          await supabase.from('telemetry_points').insert(chunk);
        }
      }

      // Sync waypoints for this trip
      const tripWaypoints = await db.select().from(waypoints).where(eq(waypoints.tripId, trip.id));
      if (tripWaypoints.length > 0) {
        const wpPayload = tripWaypoints.map(wp => ({
          trip_id: remoteTrip.id,
          username: username,
          lat: wp.lat,
          lon: wp.lon,
          type: wp.type,
          image_url: wp.imageUrl,
          timestamp: wp.timestamp
        }));
        await supabase.from('waypoints').insert(wpPayload);
      }

      // Mark trip & waypoints as synced locally
      await db.update(trips).set({ isSynced: true }).where(eq(trips.id, trip.id));
      await db.update(waypoints).set({ isSynced: true }).where(eq(waypoints.tripId, trip.id));

      console.log(`[Sync] Successfully synced trip ${trip.id}`);
    } catch (err) {
      console.error(`[Sync] Failed to sync trip ${trip.id}:`, err);
    }
  }
}

/**
 * Fetches waypoints in a given bounding box from the community.
 */
export async function fetchCommunityWaypoints(minLat: number, minLon: number, maxLat: number, maxLon: number) {
  // Since we setup PostGIS and bounding boxes would be ideal, 
  // for a simple query we can just do raw latency/longitude greater/lesser bounds
  const { data, error } = await supabase
    .from('waypoints')
    .select('*')
    .gte('lat', minLat)
    .lte('lat', maxLat)
    .gte('lon', minLon)
    .lte('lon', maxLon);

  if (error) {
    console.error('[Sync] Error fetching community waypoints:', error);
    return [];
  }
  return data;
}
