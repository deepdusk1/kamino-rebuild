import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { LIMITS, MediaError, voiceNoteDataUrl } from "./media";

/**
 * Hold-free voice recording for chat:
 *   start() → recording…  stop() → resolves with a data URL ready to send (or null if cancelled).
 * Recording stops by itself at the server's 45-second limit.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoStop = useRef<((dataUrl: string | null) => void) | null>(null);

  const clearTimer = () => {
    if (autoStop.current) clearTimeout(autoStop.current);
    autoStop.current = null;
  };
  useEffect(() => clearTimer, []);

  const finish = useCallback(async (): Promise<string | null> => {
    clearTimer();
    if (!recorder.getStatus().isRecording) return null;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    return uri ? voiceNoteDataUrl(uri) : null;
  }, [recorder]);

  /** `onLimit` is called with the finished recording if the time limit is reached. */
  const start = useCallback(
    async (onLimit: (dataUrl: string | null) => void) => {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new MediaError("Allow microphone access in Settings to record voice messages.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      onAutoStop.current = onLimit;
      autoStop.current = setTimeout(() => {
        finish().then((url) => onAutoStop.current?.(url)).catch(() => onAutoStop.current?.(null));
      }, LIMITS.voiceSeconds * 1000);
    },
    [finish, recorder],
  );

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      return await finish();
    } finally {
      setBusy(false);
    }
  }, [finish]);

  const cancel = useCallback(async () => {
    clearTimer();
    if (recorder.getStatus().isRecording) await recorder.stop().catch(() => undefined);
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
  }, [recorder]);

  return { start, stop, cancel, isRecording: state.isRecording, seconds: Math.floor(state.durationMillis / 1000), busy };
}
