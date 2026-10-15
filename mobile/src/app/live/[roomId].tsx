import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * /live/[roomId] (used by push notifications and older links): live voice and watch rooms open in the chat room
 * screen, which has the stage controls (raise hand, speakers, mute) and the call button.
 */
export default function LiveRoomRedirect() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const id = Number(roomId);
  return <Redirect href={Number.isFinite(id) && id > 0 ? `/chat/${id}` : "/chats"} />;
}
