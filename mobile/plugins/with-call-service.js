/**
 * Keeps calls running when Kamino is in the background on Android.
 *
 * Android 14+ only lets an app use the microphone or camera from the background while it runs a "foreground service"
 * of the matching type, with a visible notification. Kamino uses Notifee's service for that (src/lib/calls/
 * call-service.ts). Notifee declares it as a 3-minute "shortService"; this plugin re-declares it as a microphone /
 * camera / media-playback service, adds the permissions those types need, and stops it if the person swipes Kamino
 * away (so a call never keeps going with no screen to hang up from).
 *
 * Runs at build time (`eas build` / `expo prebuild`); there is nothing to call from the app.
 */
const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

const SERVICE = "app.notifee.core.ForegroundService";
const SERVICE_TYPES = "microphone|camera|mediaPlayback";
const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.FOREGROUND_SERVICE_CAMERA",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
];

function withCallService(config) {
  config = AndroidConfig.Permissions.withPermissions(config, PERMISSIONS);
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    // `tools:replace` needs the tools namespace on the root element.
    manifest.$ = { ...manifest.$, "xmlns:tools": "http://schemas.android.com/tools" };
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const services = (application.service ?? []).filter((s) => s.$?.["android:name"] !== SERVICE);
    services.push({
      $: {
        "android:name": SERVICE,
        "android:exported": "false",
        "android:foregroundServiceType": SERVICE_TYPES,
        "android:stopWithTask": "true",
        "tools:replace": "android:foregroundServiceType",
      },
    });
    application.service = services;
    return mod;
  });
}

module.exports = withCallService;
