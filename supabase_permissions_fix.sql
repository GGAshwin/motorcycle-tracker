-- Run this in your Supabase SQL Editor to allow routes to be deleted (unshared)

CREATE POLICY "Allow public delete trips" ON public.trips FOR DELETE USING (true);
CREATE POLICY "Allow public delete telemetry" ON public.telemetry_points FOR DELETE USING (true);
CREATE POLICY "Allow public delete waypoints" ON public.waypoints FOR DELETE USING (true);
