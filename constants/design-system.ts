export const DS = {
  color: {
    light: {
      background: "#F4F5F7",
      surface: "#FFFFFF",
      surfaceAlt: "#ECEFF3",
      border: "#D8DEE6",
      textPrimary: "#101418",
      textSecondary: "#4F5C6A",
      textMuted: "#7A8694",
      brand: "#FF6B00",
      brandStrong: "#E65A00",
      success: "#2E8B57",
      warning: "#D97706",
      error: "#D93B3B",
      onBrand: "#FFFFFF",
      tabBar: "#FFFFFF",
      tabInactive: "#768191",
      overlay: "rgba(10, 14, 20, 0.45)",
    },
    dark: {
      background: "#0D0D0F",
      surface: "#1C1C1E",
      surfaceAlt: "#232326",
      border: "#2C2C2E",
      textPrimary: "#FFFFFF",
      textSecondary: "#B2B7BF",
      textMuted: "#7D838D",
      brand: "#FF6B00",
      brandStrong: "#FF7A1F",
      success: "#34C759",
      warning: "#F5A524",
      error: "#FF453A",
      onBrand: "#FFFFFF",
      tabBar: "#1C1C1E",
      tabInactive: "#6A6A70",
      overlay: "rgba(0, 0, 0, 0.55)",
    },
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    pill: 999,
  },
  type: {
    display: {
      fontSize: 32,
      lineHeight: 38,
      fontWeight: "700" as const,
    },
    title: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "700" as const,
    },
    subtitle: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "600" as const,
    },
    body: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "400" as const,
    },
    label: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "600" as const,
      textTransform: "uppercase" as const,
      letterSpacing: 0.3,
    },
    caption: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "500" as const,
    },
  },
  elevation: {
    level1: {
      shadowColor: "#000000",
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    level2: {
      shadowColor: "#000000",
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
  },
} as const;

export type AppColorScheme = keyof typeof DS.color;

export function paletteForScheme(scheme: AppColorScheme | null | undefined) {
  return DS.color[scheme === "dark" ? "dark" : "light"];
}
