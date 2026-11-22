import {
    Pressable,
    StyleProp,
    StyleSheet,
    Text,
    ViewStyle,
} from "react-native";

import { DS, paletteForScheme } from "@/constants/design-system";
import { useColorScheme } from "@/hooks/use-color-scheme";

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  style,
}: PrimaryButtonProps) {
  const palette = paletteForScheme(useColorScheme());

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: disabled ? palette.surfaceAlt : palette.brand,
          opacity: pressed ? 0.88 : 1,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text
        style={[
          styles.label,
          { color: disabled ? palette.textMuted : palette.onBrand },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: DS.spacing.lg,
    borderRadius: DS.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...DS.type.subtitle,
    fontSize: 16,
    lineHeight: 20,
  },
});
