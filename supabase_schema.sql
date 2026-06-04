-- Run this in the Supabase SQL Editor to replace the previous schema

DROP TABLE IF EXISTS public.waypoints CASCADE;
DROP TABLE IF EXISTS public.telemetry_points CASCADE;
DROP TABLE IF EXISTS public.trips CASCADE;

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  local_id bigint NOT NULL,
  date bigint NOT NULL,
  start_time bigint NOT NULL,
  end_time bigint,
  total_dist double precision NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.telemetry_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  username text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  alt double precision,
  speed double precision,
  timestamp bigint NOT NULL
);

CREATE TABLE public.waypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  username text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  type bigint NOT NULL,
  image_url text,
  timestamp bigint NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waypoints ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts for everyone
CREATE POLICY "Allow public insert trips" ON public.trips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select trips" ON public.trips FOR SELECT USING (true);

CREATE POLICY "Allow public insert telemetry" ON public.telemetry_points FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select telemetry" ON public.telemetry_points FOR SELECT USING (true);

CREATE POLICY "Allow public insert waypoints" ON public.waypoints FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select waypoints" ON public.waypoints FOR SELECT USING (true);

-- Allow anonymous deletes for everyone
CREATE POLICY "Allow public delete trips" ON public.trips FOR DELETE USING (true);
CREATE POLICY "Allow public delete telemetry" ON public.telemetry_points FOR DELETE USING (true);
CREATE POLICY "Allow public delete waypoints" ON public.waypoints FOR DELETE USING (true);

-- PostGIS setup
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE public.waypoints ADD COLUMN IF NOT EXISTS location geography(Point, 4326);

CREATE OR REPLACE FUNCTION update_waypoint_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lon IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_waypoints_location ON public.waypoints;
CREATE TRIGGER tg_waypoints_location
BEFORE INSERT OR UPDATE ON public.waypoints
FOR EACH ROW EXECUTE FUNCTION update_waypoint_location();
