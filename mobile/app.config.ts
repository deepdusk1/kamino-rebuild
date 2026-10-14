import type { ExpoConfig } from "expo/config";

/**
 * Kamino mobile app configuration.
 *
 * Things you will probably change before publishing:
 *   - IDENTIFIER  : the app's permanent store ID (reverse-domain style). Pick it once.
 *   - EXPO_PUBLIC_API_URL : your deployed Kamino server, e.g. https://kamino.example.com
 *   - EAS_PROJECT_ID      : printed by `npx eas-cli init`; paste it below (needed for push notifications)
 */
const IDENTIFIER = "com.kelnovalabs.kamino";
const EAS_PROJECT_ID = "c7e6db5e-9724-406a-b6a0-b95b79842823"; // Linked 2026-09-29 to the kelnovalabs Expo account.

const config: ExpoConfig = {
  name: "Kamino",
  slug: "kamino",
  scheme: "kamino",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: IDENTIFIER,
    supportsTablet: true,
    buildNumber: "1",
    infoPlist: {
      // Shown to people the first time the app asks. Apple rejects vague or missing text.
      NSCameraUsageDescription: "Kamino uses the camera so you can take photos and videos to share in posts and chats.",
      NSPhotoLibraryUsageDescription: "Kamino needs your photos so you can pick pictures and videos to share.",
      NSMicrophoneUsageDescription: "Kamino uses the microphone to record voice messages and video, and so others can hear you in calls.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: IDENTIFIER,
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#8c70ef",
    },
    permissions: ["CAMERA", "RECORD_AUDIO", "POST_NOTIFICATIONS"],
    // The calling library asks for "draw over other apps", which Kamino does not use and stores dislike.
    blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW", "android.permission.WRITE_CONTACTS"],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png" },
  plugins: [
    "@livekit/react-native-expo-plugin",
    ['expo-contacts', { contactsPermission: 'Kamino reads contact email addresses only when you choose to preview them. You select which addresses to match; contact names stay on your device.' }],
    'expo-sharing',
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 160, backgroundColor: "#f8f7ff", dark: { backgroundColor: "#15112a" } }],
    ["expo-notifications", { color: "#6947d5" }],
    [
      "expo-image-picker",
      {
        photosPermission: "Kamino needs your photos so you can pick pictures and videos to share.",
        cameraPermission: "Kamino uses the camera so you can take photos and videos to share.",
      },
    ],
    ["expo-audio", { microphonePermission: "Kamino uses the microphone to record voice messages." }],
    // Live calls. This adds native code, so calls need a development or store build (not Expo Go).
    [
      "@config-plugins/react-native-webrtc",
      {
        cameraPermission: "Kamino uses the camera when you turn on video in a call.",
        microphonePermission: "Kamino uses the microphone so others can hear you in a call.",
      },
    ],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "",
    supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "",
    eas: { projectId: EAS_PROJECT_ID },
  },
};

export default config;
