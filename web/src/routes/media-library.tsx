import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { MediaLibraryPicker } from "@/components/media-v10-library";
export const Route=createFileRoute("/media-library")({component:Library});
function Library(){return <AppShell padded back title="Media library"><div className="mx-auto max-w-3xl space-y-5"><h1 className="text-2xl font-extrabold">Your media library</h1><MediaLibraryPicker kind="gif" manage/><MediaLibraryPicker kind="audio" manage/></div></AppShell>;}
