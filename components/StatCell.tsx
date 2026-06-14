import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

// ── Colour palette from main screens ──────────────────────────────────────────
const C = {
  textDark: "#111111",
  textMuted: "#666666",
  iconAccent: "#C87030",
} as const;

export function StatCell({
  icon,
  label,
  value,
  unit,
  labelOnTop = true,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit: string;
  labelOnTop?: boolean;
}) {
  const content = labelOnTop ? (
    <>
      <View style={styles.statLabelRow}>
        {icon && (
          <Ionicons
            name={icon}
            size={16}
            color={C.iconAccent}
            style={styles.statIcon}
          />
        )}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <View style={styles.statValueRow}>
        <Text style={styles.statValueLarge}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </>
  ) : (
    <>
      <View style={styles.statValueRow}>
        <Text style={styles.statValueLarge}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <View style={styles.statLabelRow}>
        {icon && (
          <Ionicons
            name={icon}
            size={16}
            color={C.iconAccent}
            style={styles.statIcon}
          />
        )}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </>
  );

  return <View style={styles.statCell}>{content}</View>;
}

const styles = StyleSheet.create({
  statCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statIcon: {
    marginRight: 2,
  },
  statLabel: {
    fontSize: 11,
    color: C.textMuted,
    fontWeight: "500",
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginTop: 4,
  },
  statValueLarge: {
    fontSize: 22,
    fontWeight: "700",
    color: C.textDark,
  },
  statUnit: {
    fontSize: 12,
    fontWeight: "600",
    color: C.textDark,
  },
});
