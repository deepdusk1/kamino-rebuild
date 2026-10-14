import { useState } from "react";
import { Sheet } from "@/components/community/sheet";
import { PostComposer } from "@/components/create/post-composer";
import type { PostType } from "@/lib/kamino/types";
import { Composer as FullEditor } from "./creator-studio";

/** Post types the quick "Create a Post" card handles; the rest open the full editor. */
const QUICK_TYPES: readonly PostType[] = ["blog", "image", "link", "poll"];

/**
 * "New post" inside a community. Everyday posts use the same "Create a Post" card as the Create screen (text,
 * pictures, poll, link, place, tags, scheduling, drafts) in a panel; quizzes, wiki pages, questions and stories
 * open the full editor. Same props as before, so every page that opens a composer keeps working.
 */
export function Composer({
  slug,
  onClose,
  onCreated,
  initialType = "blog",
}: {
  slug: string;
  onClose: () => void;
  onCreated: (id: number) => void;
  initialType?: PostType;
}) {
  const [fullType, setFullType] = useState<PostType | null>(
    QUICK_TYPES.includes(initialType) ? null : initialType,
  );

  if (fullType)
    return (
      <FullEditor slug={slug} initialType={fullType} onClose={onClose} onCreated={onCreated} />
    );

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="New post"
      description="Share updates, art, thoughts, or anything with your community."
      className="lg:w-[600px]"
    >
      <PostComposer
        slug={slug}
        lockSlug
        showHeading={false}
        onPublished={(id) => onCreated(id)}
        onFullEditor={(type) => setFullType(type)}
      />
    </Sheet>
  );
}
