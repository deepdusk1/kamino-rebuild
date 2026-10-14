import * as Linking from "expo-linking";
import { useState, type ReactNode } from "react";
import { Image } from "expo-image";
import { imageSource } from "@/api/client";
import { View } from "react-native";
import { font, radius, useTheme } from "@/theme";
import { Txt } from "./ui";

/**
 * Renders the small formatting vocabulary Kamino posts use (same as the website):
 *   # / ## headings, > quotes, - lists, **bold**, _italic_, ~~strike~~, [text](https://link)
 * Nothing else is interpreted, so posted text can never run code or open odd links.
 */
const TOKEN = /(\|\|[^|\n]+\|\||\*\*[^*\n]+\*\*|_[^_\n]+_|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g;
function Spoiler({text}:{text:string}){const [open,setOpen]=useState(false),theme=useTheme();return <Txt accessibilityRole="button" accessibilityLabel={open?"Hide spoiler":"Reveal spoiler"} onPress={()=>setOpen(!open)} style={{backgroundColor:open?"transparent":theme.muted,color:open?theme.text:theme.muted}}>{text}</Txt>;}

function inline(text: string, accent: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if(part.startsWith("||")&&part.endsWith("||"))return <Spoiler key={i} text={part.slice(2,-2)}/>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <Txt key={i} style={{ fontFamily: font.heavy }}>{part.slice(2, -2)}</Txt>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <Txt key={i} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</Txt>;
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) return <Txt key={i} style={{ textDecorationLine: "line-through" }}>{part.slice(2, -2)}</Txt>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return <Txt key={i} accessibilityRole="link" style={{ color: accent, fontFamily: font.semibold, textDecorationLine: "underline" }} onPress={() => void Linking.openURL(link[2]!)}>{link[1]}</Txt>;
    return part;
  });
}

/**
 * Post text. `formatted` turns on the markdown-like rules above; otherwise the text is shown as written.
 * `size` is the body text size (default 14.5, like the post page in the mockup).
 */
export function FormattedBody({ body, formatted, size = 14.5 }: { body: string; formatted: boolean; size?: number }) {
  const theme = useTheme();
  const text = { fontFamily: font.regular, fontSize: size, lineHeight: Math.round(size * 1.5), color: theme.text };
  if (!formatted) return <Txt selectable style={text}>{body.split(/(\|\|[^|\n]+\|\|)/g).map((p,i)=>p.startsWith("||")&&p.endsWith("||")?<Spoiler key={i} text={p.slice(2,-2)}/>:p)}</Txt>;
  return (
    <View style={{ gap: 6 }}>
      {body.split("\n").map((line, i) => {
        const image=/^!\[([^\]]*)\]\((\/api\/v1\/content-media\/\d+)\)$/.exec(line);
        if(image)return <Image key={i} source={imageSource(image[2]!)} cachePolicy="none" accessible accessibilityLabel={image[1]||"Article image"} contentFit="contain" style={{height:280,width:"100%",borderRadius:16}}/>;
        if (line.startsWith("## ")) return <Txt key={i} accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: size + 2.5, lineHeight: size + 9, color: theme.ink, paddingTop: 6 }}>{inline(line.slice(3), theme.accent)}</Txt>;
        if (line.startsWith("# ")) return <Txt key={i} accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: size + 6, lineHeight: size + 12, letterSpacing: -0.3, color: theme.ink, paddingTop: 6 }}>{inline(line.slice(2), theme.accent)}</Txt>;
        if (line.startsWith("> "))
          return (
            <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: theme.accent, backgroundColor: theme.tint, borderTopRightRadius: radius.sm, borderBottomRightRadius: radius.sm, paddingLeft: 12, paddingVertical: 6, paddingRight: 8 }}>
              <Txt style={[text, { color: theme.muted, fontStyle: "italic" }]}>{inline(line.slice(2), theme.accent)}</Txt>
            </View>
          );
        if (line.startsWith("- "))
          return (
            <View key={i} style={{ flexDirection: "row", gap: 8, paddingLeft: 2 }}>
              <Txt style={[text, { color: theme.accent, fontFamily: font.heavy }]}>{"•"}</Txt>
              <Txt style={[text, { flex: 1 }]}>{inline(line.slice(2), theme.accent)}</Txt>
            </View>
          );
        return line.trim() ? <Txt key={i} selectable style={text}>{inline(line, theme.accent)}</Txt> : <View key={i} style={{ height: 2 }} />;
      })}
    </View>
  );
}
