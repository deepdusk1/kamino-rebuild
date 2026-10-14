import { Avatar } from "@/components/ui";
import { toImageSource, type Person } from "./types";

/** `Avatar` for a kit `Person` (photo, server photo or colourful initial), with optional white ring and presence dot. */
export function PersonAvatar({ person, size = 40, outline, online }: { person: Person; size?: number; outline?: boolean | number; online?: boolean }) {
  return (
    <Avatar
      name={person.name}
      hue={person.hue}
      userId={person.userId}
      version={person.avatarV}
      source={toImageSource(person.image)}
      size={size}
      outline={outline}
      online={online}
    />
  );
}
