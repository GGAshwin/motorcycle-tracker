import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { DS, paletteForScheme } from "@/constants/design-system";
import { useColorScheme } from "@/hooks/use-color-scheme";

type AppCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function AppCard({ children, style }: AppCardProps) {
  const palette = paletteForScheme(useColorScheme());

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: DS.radius.md,
    padding: DS.spacing.md,
    ...DS.elevation.level1,
  },
});
