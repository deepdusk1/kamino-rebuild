import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { WebView } from "react-native-webview";
import { readSessionToken } from "@/auth/session";
import { Button, Loading, Txt } from "@/components/ui";
import { apiBaseUrl } from "@/api/config";
import { useTheme } from "@/theme";

/**
 * The watch party, in-app: the website's watch deck (video, queue, ready check, chat) in a
 * WebView. The native session token is injected into sessionStorage before the page loads, so
 * the member is already signed in. Playback sync travels peer-to-peer (WebRTC data channels),
 * which Android's WebView and iOS 14.3+ WKWebView both support.
 */
export default function WatchParty() {
  const theme = useTheme();
  const { roomId: roomParam } = useLocalSearchParams<{ roomId: string }>();
  const roomId = Number(roomParam);
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readSessionToken().then((value) => {
      if (!cancelled) setToken(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Number.isFinite(roomId)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <Txt variant="section">This watch party could not open.</Txt>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 52,
          paddingBottom: 10,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        <Pressable
          accessibilityLabel="Back to chat"
          onPress={() => router.back()}
          style={{ padding: 6 }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.ink} />
        </Pressable>
        <Txt variant="label">Watch party</Txt>
        <Pressable
          accessibilityLabel="Open the watch party in the browser"
          onPress={() => void Linking.openURL(`${apiBaseUrl()}/chats/${roomId}`)}
          style={{ padding: 6 }}
        >
          <Ionicons name="open-outline" size={22} color={theme.ink} />
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        {token !== null ? (
          <WebView
            source={{ uri: `${apiBaseUrl()}/chats/${roomId}` }}
            style={{ flex: 1, backgroundColor: theme.bg, opacity: loaded ? 1 : 0 }}
            injectedJavaScriptBeforeContentLoaded={sessionInjection(token)}
            domStorageEnabled
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            sharedCookiesEnabled
            onLoadEnd={() => setLoaded(true)}
            onRenderProcessGone={() => setFailed(true)}
          />
        ) : null}
        {!loaded && !failed ? <Loading label="Opening the watch party…" /> : null}
        {failed ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
            <Txt variant="section" style={{ textAlign: "center" }}>
              The watch party stopped unexpectedly.
            </Txt>
            <Button
              label="Try again"
              onPress={() => {
                setFailed(false);
                setLoaded(false);
              }}
              small
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Puts the native session token where the website's client looks for it (sessionStorage). */
function sessionInjection(token: string): string {
  const safe = token.replace(/[^A-Za-z0-9._-]/g, "");
  return [
    "try {",
    `  window.sessionStorage.setItem('grok-auth.bearer-token', '${safe}');`,
    "} catch (e) {}",
    "true;",
  ].join("\n");
}
