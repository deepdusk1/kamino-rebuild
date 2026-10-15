import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { LIMITS, MediaError, voiceNoteDataUrl } from "./media";

/**
 * Voice notes: AAC in an .m4a file (plays on every iPhone, Android phone and browser), mono at 64 kbit/s. That is
 * plenty for speech and keeps a 45-second note around 360 KB, well under the server's 1.5 MB limit (the "high
 * quality" music preset used before made stereo 128 kbit/s files twice that size, slow to send on mobile data).
 */
export const VOICE_NOTE_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  sampleRate: 44100,
};

/** After recording, go back to normal playback (loudspeaker, and voice notes play even with the silent switch on). */
export async function restorePlaybackAudioMode(): Promise<void> {
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
}

/**
 * Hold-free voice recording for chat:
 *   start() → recording…  stop() → resolves with a data URL ready to send (or null if cancelled).
 * Recording stops by itself at the server's 45-second limit and hands the note to the latest `onLimit`.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(VOICE_NOTE_PRESET);
  const state = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoStop = useRef<((dataUrl: string | null) => void) | null>(null);
  const starting = useRef(false);

  const clearTimer = () => {
    if (autoStop.current) clearTimeout(autoStop.current);
    autoStop.current = null;
  };

  const finish = useCallback(async (): Promise<string | null> => {
    clearTimer();
    if (!recorder.getStatus().isRecording) return null;
    await recorder.stop();
    await restorePlaybackAudioMode();
    const uri = recorder.uri;
    return uri ? voiceNoteDataUrl(uri) : null;
  }, [recorder]);

  /** `onLimit` is called with the finished recording if the time limit is reached. */
  const start = useCallback(
    async (onLimit: (dataUrl: string | null) => void) => {
      if (starting.current || recorder.getStatus().isRecording) return;
      starting.current = true;
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) throw new MediaError("Allow microphone access in Settings to record voice messages.");
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        onAutoStop.current = onLimit;
        autoStop.current = setTimeout(() => {
          finish()
            .then((url) => onAutoStop.current?.(url))
            .catch(() => onAutoStop.current?.(null));
        }, LIMITS.voiceSeconds * 1000);
      } finally {
        starting.current = false;
      }
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
    onAutoStop.current = null;
    if (recorder.getStatus().isRecording) await recorder.stop().catch(() => undefined);
    await restorePlaybackAudioMode();
  }, [recorder]);

  // Leaving the chat while recording throws the recording away and frees the microphone.
  useEffect(
    () => () => {
      clearTimer();
      onAutoStop.current = null;
      try {
        if (recorder.getStatus().isRecording) void recorder.stop().catch(() => undefined);
      } catch {
        // The recorder was already released with the screen.
      }
    },
    [recorder],
  );

  return { start, stop, cancel, isRecording: state.isRecording, seconds: Math.floor(state.durationMillis / 1000), busy };
}
