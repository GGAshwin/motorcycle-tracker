import { Dimensions, StyleSheet } from "react-native";
import { TRIP_COLORS as C } from "@/constants/trip";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export { SCREEN_HEIGHT };

export const tripScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  scrollView: {
    flex: 1,
  },

  // Loading / Empty states
  centred: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.bg,
    gap: 12,
    padding: 32,
  },
  loadingText: {
    color: C.textSecondary,
    fontSize: 15,
    marginTop: 8,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  emptyBody: {
    color: C.textSecondary,
    fontSize: 14,
    textAlign: "center",
  },

  // Header
  header: {
    backgroundColor: C.headerBg,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    alignItems: "center",
    gap: 2,
  },
  headerIconLabel: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 4,
  },

  // Map
  mapContainer: {
    height: SCREEN_HEIGHT * 0.35,
    backgroundColor: "#E5E5E5",
  },
  mapExpanded: {
    height: SCREEN_HEIGHT * 0.6,
  },
  mapOverlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  mapOverlayText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "500",
  },
  collapseBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  collapseBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },

  // Markers
  startMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 3,
    borderColor: C.routeBlue,
    justifyContent: "center",
    alignItems: "center",
  },
  startMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.routeBlue,
  },
  endMarker: {
    alignItems: "center",
    justifyContent: "center",
  },
  waypointMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  // Profile
  profileSection: {
    backgroundColor: C.cardBg,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
    color: C.textDark,
    letterSpacing: 0.5,
  },

  // Stats
  statsCard: {
    backgroundColor: C.cardBg,
    marginTop: 1,
  },
  statsRow: {
    flexDirection: "row",
    paddingVertical: 16,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: C.divider,
    marginVertical: 4,
  },
  divider: {
    height: 1,
    backgroundColor: C.divider,
  },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.cardBg,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: C.divider,
    paddingBottom: 20,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  bottomBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: C.textDark,
    letterSpacing: 0.5,
  },
  bottomDivider: {
    width: 1,
    backgroundColor: C.divider,
    marginVertical: 12,
  },

  // Photo overlay
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  fullPhoto: {
    width: "100%",
    height: "80%",
  },
  closeBtn: {
    position: "absolute",
    bottom: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,59,48,0.15)",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  closeBtnText: {
    color: "#FF3B30",
    fontSize: 16,
    fontWeight: "600",
  },
});
