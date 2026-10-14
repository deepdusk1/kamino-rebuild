import { useEffect, useState } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { View } from "react-native";
import { Txt } from "@/components/ui";
import { useTheme } from "@/theme";

/**
 * Connectivity, the one place: NetInfo drives TanStack Query's online manager (so paused
 * refetches resume on reconnect) and an offline banner that appears over every screen.
 * Reading anything cached still works while offline; writes will fail with a clear error.
 */
export function useConnectivity(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    onlineManager.setOnline(true);
    const unsubscribeNet = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = !!state.isConnected && !(state.isInternetReachable === false);
      onlineManager.setOnline(connected);
      setOnline(connected);
    });
    void NetInfo.fetch().then((state) => {
      const connected = !!state.isConnected && !(state.isInternetReachable === false);
      onlineManager.setOnline(connected);
      setOnline(connected);
    });
    return unsubscribeNet;
  }, []);

  return online;
}

/** Thin banner pinned above the app whenever the device is offline. */
export function OfflineBanner() {
  const online = useConnectivity();
  const client = useQueryClient();
  const theme = useTheme();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        alignItems: "center",
      }}
      pointerEvents="none"
    >
      <View
        style={{
          backgroundColor: theme.dark ? "#3a2f14" : "#fff4d6",
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 8,
          marginBottom: 12,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        <Txt
          variant="small"
          tone="default"
          onPress={() => void client.refetchQueries({ type: "active" })}
          style={{ color: theme.dark ? "#f4d98a" : "#7a5c00" }}
        >
          You are offline — showing recent content. Tap to retry.
        </Txt>
      </View>
    </View>
  );
}
