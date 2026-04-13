# MotoTrack

**MotoTrack** is a React Native mobile application built with **Expo** (specifically using `expo-router`). It is designed to track motorcycle rides in real-time. It records telemetry data (like GPS coordinates, speed, and distance), stores it locally on the device using SQLite, and lets users view their past trips on a customized dark-themed map.

## Key Technologies Used
*   **Frameworks:** Expo, React Native, Expo Router.
*   **Database:** Local SQLite (`expo-sqlite`) with **Drizzle ORM** for schema definition and querying.
*   **Maps & Location:** `react-native-maps` for displaying trip routes, and `expo-location` with `expo-task-manager` for background GPS tracking.

---

## Code Flow & Architecture

### 1. Entry & Initialization (`app/_layout.tsx`)
This is the root of the application navigation. Upon starting, the layout file performs two critical setup tasks:
*   **Database Setup:** It calls `initDatabase()` (from `db/client.ts`) within a `useEffect` to open the local SQLite file and bootstrap Drizzle ORM before anything renders. The app waits until `dbReady` is true before rendering the navigation stack.
*   **Background GPS Task:** It imports `lib/trackingTask.ts` as a side-effect, which registers an Expo background task to listen for location updates, even if the app goes to the background.

### 2. Database Schema (`db/schema.ts`)
The application uses a relational design with two tables:
*   **`trips`**: Records a single ride session. It stores a start time, end time, and accumulated `totalDist`.
*   **`telemetry_points`**: Records high-frequency GPS snapshots linked via a foreign key (`tripId`) to the `trips` table. Each point contains latitude, longitude, altitude, speed, and a timestamp.

### 3. Real-Time Riding Screen (`app/(tabs)/index.tsx`)
This is the primary dashboard of the app.
*   **State Management:** It relies on a custom hook `useCurrentRide()` to interface with Expo Location and manage tracking state.
*   **Functionality:** It displays live speedometer data (`speedKmh`) and the current session's distance. It provides a large `Start Ride` / `Stop Ride` button to manually control recording.
*   **UX Features:** When tracking is active, the app utilizes `expo-keep-awake` to prevent the device screen from turning off, and triggers a pulsing "REC" UI animation.

### 4. History / Explore Screen (`app/(tabs)/explore.tsx`)
This screen acts as your ride logbook.
*   **Data Fetching:** Every time the screen comes into focus, it runs a Drizzle query against the `trips` table to get the user's ride history, sorted by the most recent date.
*   **Interactions:** 
    *   Tapping a row uses the Expo Router to navigate you to `/trip/[id]` to see details.
    *   Long-pressing a row opens a custom delete-confirmation modal which allows deleting the trip from the database.

### 5. Trip Details & Map View (`app/trip/[id].tsx`)
*   **Fetching Data:** It extracts the `id` from the URL parameters and runs a database query to load the `trip` details and all associated `telemetry_points`.
*   **Map Rendering:** Uses `react-native-maps` with a highly customized dark layout (`DARK_MAP_STYLE`). It renders the GPS coordinates into an orange `<Polyline>` and places Start/End markers.
*   **Calculations:** It runs in-memory calculations using the `useMemo` hook to compute the **Max Speed** and **Average Speed** from the loaded telemetry array (discarding speeds < 0.5m/s for avg), displaying them beautifully in a bottom stats card.

---

## Understanding Data Flow
1. User taps **"Start"** on the home screen.
2. A new entry is created in the `trips` database table.
3. The background location task (`lib/trackingTask.ts`) fires continuously, injecting coordinate rows into the `telemetry_points` table and updating the active `trip`'s accumulated data (like `totalDist`).
4. The user taps **"Stop"**. The tracking task stops and the `trip` record's `endTime` is finalized.
5. In History (`explore.tsx`), Drizzle fetches the updated `trips` list for display.
6. When viewing a specific trip map (`[id].tsx`), Drizzle queries everything with that `tripId` to paint the polyline route onto the MapView.
