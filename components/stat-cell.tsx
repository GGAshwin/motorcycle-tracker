import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

const C_ICON_ACCENT = "#C87030";
const C_TEXT_MUTED = "#666666";
const C_TEXT_DARK = "#111111";

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
  const labelRow = (
    <View style={styles.statLabelRow}>
      {icon && (
        <Ionicons name={icon} size={16} color={C_ICON_ACCENT} style={styles.statIcon} />
      )}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const valueRow = (
    <View style={styles.statValueRow}>
      <Text style={styles.statValueLarge}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
    </View>
  );

  return (
    <View style={styles.statCell}>
      {labelOnTop ? <>{labelRow}{valueRow}</> : <>{valueRow}{labelRow}</>}
    </View>
  );
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
    color: C_TEXT_MUTED,
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
    color: C_TEXT_DARK,
  },
  statUnit: {
    fontSize: 12,
    fontWeight: "600",
    color: C_TEXT_DARK,
  },
});
