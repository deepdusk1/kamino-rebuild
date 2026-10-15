// ===== FILE: mobile/src/app/_layout.tsx =====
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import {
  Stack,
  router,
  SplashScreen,
  usePathname,
  useRootNavigationState,
  type ErrorBoundaryProps,
  type Href,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { rpc } from "@/api/client";
import {
  useRealtimeSSE,
  useSSEListener,
  type KaminoRealtimeEvent,
} from "@/api/sse";
import { SessionProvider, useSession } from "@/auth/session";
import { IdentityAppearance } from "@/components/IdentityAppearance";
import {
  IncomingCallBanner,
  callRoomFrom,
} from "@/components/IncomingCallBanner";
import { Aurora, Backdrop, Button, Txt } from "@/components/ui";
import { OfflineBanner } from "@/lib/connectivity";
import { appHrefFromServerHref } from "@/lib/hrefs";
import { wireOfflineFlush } from "@/lib/offline-queue";
import {
  configureForegroundNotifications,
  dismissIncomingCallNotification,
  extractNotificationTarget,
  getColdStartNotificationTarget,
  handleNotificationResponseAction,
  registerPushDevice,
  unregisterPushDevice,
  type ParsedPushTarget,
} from "@/lib/push";
import { useNotificationTap } from "@/lib/useNotificationTap";
import { useOnboardingRedirect } from "@/lib/useWelcome";
import { font, space, useTheme } from "@/theme";

void SplashScreen.preventAutoHideAsync();
configureForegroundNotifications();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolves a server push href or parsed notification target into an exact Expo Router path
 * (`/chat/[roomId]`, `/call/[roomId]`, `/live/[roomId]`, `/community/[slug]`, etc.).
 */
function resolveNotificationAppRoute(
  href: string | null,
  target?: ParsedPushTarget | null,
): Href | null {
  if (target) {
    if (target.isCall && target.roomId !== null) {
      // Opens the ringing screen (Answer / Decline); the microphone only starts once you answer.
      return `/call/${target.roomId}?mode=incoming` as Href;
    }
    if (target.isEventOrLive && target.roomId !== null) {
      return `/live/${target.roomId}` as Href;
    }
    if (target.isChatMessage && target.roomId !== null) {
      return `/chat/${target.roomId}` as Href;
    }
    if (target.communitySlug) {
      return `/community/${target.communitySlug}` as Href;
    }
  }

  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;

  const callRoom = callRoomFrom(trimmed);
  if (callRoom !== null) {
    return `/call/${callRoom}?mode=incoming` as Href;
  }

  const directCallMatch = /^\/call\/(\d+)(?:[?#]|$)/.exec(trimmed);
  if (directCallMatch?.[1]) {
    return `/call/${Number(directCallMatch[1])}?mode=incoming` as Href;
  }

  const directLiveMatch = /^\/live\/(\d+)(?:[?#]|$)/.exec(trimmed);
  if (directLiveMatch?.[1]) {
    return `/live/${Number(directLiveMatch[1])}` as Href;
  }

  const directChatMatch = /^\/(?:chats|chat)\/(\d+)(?:[?#]|$)/.exec(trimmed);
  if (directChatMatch?.[1]) {
    return `/chat/${Number(directChatMatch[1])}` as Href;
  }

  const directCommunityMatch = /^\/(?:c|community)\/([a-z0-9-]+)(?:[/?#]|$)/i.exec(
    trimmed,
  );
  if (directCommunityMatch?.[1] && !trimmed.includes("/post/")) {
    return `/community/${directCommunityMatch[1]}` as Href;
  }

  return appHrefFromServerHref(trimmed) as Href;
}

/** Shown if a screen crashes, instead of a blank white page. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: space.xl,
        gap: space.md,
      }}
    >
      <Aurora />
      <Txt variant="title">Something broke</Txt>
      <Txt tone="muted" style={{ textAlign: "center" }}>
        {error.message}
      </Txt>
      <Button label="Try again" onPress={retry} />
    </View>
  );
}

/**
 * Mounts and manages the singleton SSE stream (`GET /api/events`) via `useRealtimeSSE`,
 * synchronizes TanStack Query caches in real time, and stops ringing when a call ends (`call.ended`).
 * Incoming calls are shown by IncomingCallBanner, which asks before joining.
 */
export function RealtimeSSEBridge({ signedIn }: { signedIn: boolean }) {
  useRealtimeSSE(signedIn);

  const onRealtimeEvent = useCallback(
    (event: KaminoRealtimeEvent) => {
      if (!signedIn) return;

      if (event.type === "call.ended") {
        const callId =
          typeof event.payload.callId === "number"
            ? event.payload.callId
            : typeof event.payload.id === "number"
              ? event.payload.id
              : null;
        void dismissIncomingCallNotification(event.roomId, callId);
        return;
      }

      // Incoming calls ring through IncomingCallBanner (Answer / Decline). The call screen is never opened here:
      // opening it joins the call and switches on the microphone, so it has to be the person's choice.
    },
    [signedIn],
  );

  useSSEListener(onRealtimeEvent);
  return null;
}

export default function RootLayout() {
  // Plus Jakarta Sans in the four weights the design system uses (paired with Nunito fallback in src/theme).
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Single TanStack Query client for the entire app.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <IdentityAppearance>
            <Navigation />
            <OfflineBanner />
          </IdentityAppearance>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Navigation() {
  const theme = useTheme();
  const { status, userId } = useSession();
  const pathname = usePathname();
  const navState = useRootNavigationState();
  const navReady = Boolean(navState?.key);
  const lastResponse = useNotificationTap();

  const handledNotificationKeys = useRef<Set<string>>(new Set());
  const coldStartChecked = useRef(false);
  const prevStatusRef = useRef(status);

  // Send newly created accounts that haven't finished onboarding to `/onboarding` once.
  useOnboardingRedirect(status === "signedIn");

  useEffect(() => {
    if (status !== "loading") {
      void SplashScreen.hideAsync();
    }
  }, [status]);

  // Register FCM + Expo push tokens when signed in; unregister cleanly on transition to signedOut.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === "signedIn") {
      void registerPushDevice();
    } else if (prev === "signedIn" && status === "signedOut") {
      handledNotificationKeys.current.clear();
      coldStartChecked.current = false;
      void unregisterPushDevice();
    }
  }, [status]);

  // Flush queued offline chat messages via `rpc("sendMessage", input)` scoped to the active account.
  useEffect(() => {
    if (status !== "signedIn" || !userId) return;
    wireOfflineFlush(userId, (input) => rpc("sendMessage", input));
  }, [status, userId]);

  const navigateToTarget = useCallback(
    (route: Href | null) => {
      if (!route || !navReady || status !== "signedIn") return;
      const routeStr = typeof route === "string" ? route : "";
      if (routeStr && routeStr === pathname) return;
      router.push(route);
    },
    [navReady, pathname, status],
  );

  const processNotificationResponse = useCallback(
    async (
      response: Notifications.NotificationResponse | null | undefined,
    ): Promise<void> => {
      if (!response || status !== "signedIn" || !navReady) return;

      const notifId = response.notification.request.identifier;
      const actionId = response.actionIdentifier;
      const dedupKey = `${notifId}:${actionId}`;
      if (handledNotificationKeys.current.has(dedupKey)) return;
      handledNotificationKeys.current.add(dedupKey);

      const rawData = response.notification.request.content.data;
      const dataRecord = isRecord(rawData) ? rawData : undefined;
      const parsedTarget = extractNotificationTarget(dataRecord);

      const actionHref = await handleNotificationResponseAction(response);
      if (!actionHref && actionId !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
        // Inline Reply, Mark Read, or Decline Call was handled silently in the background.
        return;
      }
      // "Answer" on the notification: join the call straight away.
      if (actionId === "ACCEPT_CALL" && parsedTarget.roomId !== null) {
        navigateToTarget(`/call/${parsedTarget.roomId}?mode=answer` as Href);
        return;
      }

      const destination = resolveNotificationAppRoute(
        actionHref ?? parsedTarget.href,
        parsedTarget,
      );
      navigateToTarget(destination);
    },
    [status, navReady, navigateToTarget],
  );

  // 1. Handle taps surfaced by `useNotificationTap()`
  useEffect(() => {
    if (!lastResponse) return;
    void processNotificationResponse(lastResponse);
  }, [lastResponse, processNotificationResponse]);

  // 2. Cold-start killed-state recovery (`getLastNotificationResponseAsync` + `getColdStartNotificationTarget`)
  // and live foreground/background notification listeners.
  useEffect(() => {
    if (status !== "signedIn" || !navReady || Platform.OS === "web") return;

    if (!coldStartChecked.current) {
      coldStartChecked.current = true;
      void Notifications.getLastNotificationResponseAsync()
        .then(async (initialResponse) => {
          if (initialResponse) {
            await processNotificationResponse(initialResponse);
            return;
          }
          const coldTarget = await getColdStartNotificationTarget();
          if (coldTarget) {
            const route = resolveNotificationAppRoute(
              coldTarget.href,
              coldTarget,
            );
            navigateToTarget(route);
          }
        })
        .catch(() => undefined);
    }

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        void processNotificationResponse(response);
      });

    const receivedSubscription =
      Notifications.addNotificationReceivedListener((notification) => {
        const rawData = notification.request.content.data;
        const dataRecord = isRecord(rawData) ? rawData : undefined;
        const target = extractNotificationTarget(dataRecord);

        if (target.isCallEnded) {
          void dismissIncomingCallNotification(target.roomId, target.callId);
          return;
        }

        // An incoming call that arrives while Kamino is open is shown by IncomingCallBanner; nothing joins by itself.
      });

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [
    status,
    navReady,
    pathname,
    processNotificationResponse,
    navigateToTarget,
  ]);

  if (status === "loading") return null;

  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <RealtimeSSEBridge signedIn={status === "signedIn"} />
      <Stack
        screenLayout={({ route, children }) =>
          route.name === "(tabs)" ? children : <Backdrop>{children}</Backdrop>
        }
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.accent,
          headerTitleStyle: { fontFamily: font.heavy, color: theme.ink },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        {/* Signed out: Welcome splash/onboarding comes first, then Sign In / Create Account */}
        <Stack.Protected guard={status === "signedOut"}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>

        {/* Age verification gate when required */}
        <Stack.Protected guard={status === "needsAge"}>
          <Stack.Screen
            name="age"
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </Stack.Protected>

        {/* Signed in: Main tabs + all nested community, chat, call, live, watch, story, and profile routes */}
        <Stack.Protected guard={status === "signedIn"}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="onboarding"
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen name="search" options={{ headerShown: false }} />
          <Stack.Screen
            name="community/[slug]/index"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="community/[slug]/post/[postId]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="community/[slug]/compose"
            options={{ title: "New post", presentation: "modal" }}
          />
          <Stack.Screen
            name="community/[slug]/wiki"
            options={{ title: "Wiki" }}
          />
          <Stack.Screen
            name="community/[slug]/events"
            options={{ title: "Events" }}
          />
          <Stack.Screen
            name="community/[slug]/rank"
            options={{ title: "Leaderboard" }}
          />
          <Stack.Screen
            name="community/[slug]/members"
            options={{ title: "Members" }}
          />
          <Stack.Screen
            name="community/[slug]/files"
            options={{ title: "Shared files" }}
          />
          <Stack.Screen
            name="community/[slug]/news"
            options={{ title: "News feed" }}
          />
          <Stack.Screen
            name="community/[slug]/look"
            options={{ title: "Community look" }}
          />
          <Stack.Screen
            name="community/[slug]/chats"
            options={{ title: "Chat rooms" }}
          />
          <Stack.Screen
            name="community/[slug]/mod"
            options={{ title: "Moderation" }}
          />
          <Stack.Screen
            name="community/[slug]/standing"
            options={{ title: "My standing" }}
          />
          <Stack.Screen
            name="community/[slug]/roleplay/index"
            options={{ title: "Stories" }}
          />
          <Stack.Screen
            name="community/[slug]/roleplay/[sceneId]"
            options={{ title: "Story" }}
          />
          <Stack.Screen
            name="chat/[roomId]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="chat/watch/[roomId]"
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="call/[roomId]"
            options={{
              title: "Call",
              headerShown: false,
              presentation: "fullScreenModal",
            }}
          />
          <Stack.Screen
            name="live/[roomId]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="profile/[handle]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="new-community"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen
            name="notifications"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="saved" options={{ title: "Saved" }} />
          <Stack.Screen name="settings" options={{ title: "Settings" }} />
          <Stack.Screen name="safety" options={{ title: "Safety Center" }} />
          <Stack.Screen
            name="edit-profile"
            options={{ title: "Edit profile" }}
          />
          <Stack.Screen name="tools" options={{ title: "More tools" }} />
          <Stack.Screen
            name="security"
            options={{ title: "Account security" }}
          />
          <Stack.Screen
            name="privacy-dashboard"
            options={{ title: "Privacy & safety" }}
          />
          <Stack.Screen
            name="community/[slug]/tools"
            options={{ title: "Community tools" }}
          />
          <Stack.Screen
            name="content-studio"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="profile-stories"
            options={{ title: "Profile stories" }}
          />
          <Stack.Screen name="inbox-tools" options={{ headerShown: false }} />
          <Stack.Screen
            name="connections"
            options={{ title: "Connections" }}
          />
          <Stack.Screen
            name="groups/[roomId]"
            options={{ title: "Group settings" }}
          />
          <Stack.Screen
            name="media-library"
            options={{ title: "Media library" }}
          />
          <Stack.Screen
            name="short-videos"
            options={{ title: "Short videos", headerShown: false }}
          />
          <Stack.Screen
            name="smart-search"
            options={{ title: "Find your people" }}
          />
          <Stack.Screen
            name="operations"
            options={{ title: "Activity & safety" }}
          />
          <Stack.Screen
            name="admin-operations"
            options={{ title: "Operations dashboard" }}
          />
          <Stack.Screen
            name="admin-analytics"
            options={{ title: "Platform analytics" }}
          />
          <Stack.Screen
            name="profile-content"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="tutorial" options={{ title: "Welcome tour" }} />
          <Stack.Screen
            name="invite/[code]"
            options={{ title: "Invitation" }}
          />
        </Stack.Protected>

        <Stack.Screen name="kit" options={{ headerShown: false }} />
        <Stack.Screen name="appeal" options={{ title: "Appeal a decision" }} />
      </Stack>
      {status === "signedIn" ? <IncomingCallBanner /> : null}
    </>
  );
}