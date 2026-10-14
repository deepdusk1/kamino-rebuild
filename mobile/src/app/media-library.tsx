import { Screen, Txt } from "@/components/ui";
import { MediaLibraryPicker } from "@/components/content/MediaLibraryPicker";
export default function Library(){return <Screen><Txt variant="title">Your media library</Txt><MediaLibraryPicker kind="gif" manage/><MediaLibraryPicker kind="audio" manage/></Screen>;}
