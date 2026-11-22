import { Tabs } from "expo-router";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { paletteForScheme } from "@/constants/design-system";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const palette = paletteForScheme(useColorScheme());

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: palette.tabBar,
          borderTopColor: palette.border,
        },
        tabBarActiveTintColor: palette.brand,
        tabBarInactiveTintColor: palette.tabInactive,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ride",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="gauge" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="clock.arrow.circlepath" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "Community",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="person.2.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
