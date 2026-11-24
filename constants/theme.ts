/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { DS } from "@/constants/design-system";
import { Platform } from "react-native";

const tintColorLight = DS.color.light.brand;
const tintColorDark = DS.color.dark.brand;

export const Colors = {
  light: {
    text: DS.color.light.textPrimary,
    background: DS.color.light.background,
    card: DS.color.light.surface,
    border: DS.color.light.border,
    tint: tintColorLight,
    icon: DS.color.light.textSecondary,
    tabIconDefault: DS.color.light.tabInactive,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: DS.color.dark.textPrimary,
    background: DS.color.dark.background,
    card: DS.color.dark.surface,
    border: DS.color.dark.border,
    tint: tintColorDark,
    icon: DS.color.dark.textSecondary,
    tabIconDefault: DS.color.dark.tabInactive,
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
