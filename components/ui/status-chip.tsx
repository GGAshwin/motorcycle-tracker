import { StyleSheet, Text, View } from "react-native";

import { DS, paletteForScheme } from "@/constants/design-system";
import { useColorScheme } from "@/hooks/use-color-scheme";

type ChipTone = "brand" | "success" | "warning" | "error" | "neutral";

type StatusChipProps = {
  label: string;
  tone?: ChipTone;
};

function colorForTone(
  tone: ChipTone,
  palette: ReturnType<typeof paletteForScheme>,
) {
  if (tone === "brand") return palette.brand;
  if (tone === "success") return palette.success;
  if (tone === "warning") return palette.warning;
  if (tone === "error") return palette.error;
  return palette.textSecondary;
}

export function StatusChip({ label, tone = "neutral" }: StatusChipProps) {
  const palette = paletteForScheme(useColorScheme());
  const accent = colorForTone(tone, palette);

  return (
    <View
      style={[
        styles.base,
        { borderColor: accent, backgroundColor: palette.surfaceAlt },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text style={[styles.label, { color: palette.textPrimary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: DS.radius.pill,
    paddingHorizontal: DS.spacing.sm,
    paddingVertical: DS.spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: DS.spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    ...DS.type.label,
  },
});
