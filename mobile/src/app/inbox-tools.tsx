import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AppHeader } from "@/components/k";
import { Screen, Card, Button, Field, Txt } from "@/components/ui";
import { contentApi } from "@/lib/content-v9";
import { showError } from "@/lib/errors";
export default function InboxTools(){const [name,setName]=useState(""),[handles,setHandles]=useState(""),[busy,setBusy]=useState(false);async function create(){setBusy(true);try{const r=await contentApi.group(name,handles.split(/[ ,\n]+/).map(h=>h.replace(/^@/,"")).filter(Boolean));router.replace(`/chat/${r.roomId}`);}catch(e){showError(e);}finally{setBusy(false);}}return <View style={{flex:1}}><AppHeader back/><Screen><Txt variant="screen">Start a group</Txt><Txt tone="muted">A private place for your friends, independent of any community.</Txt><Card><View style={{gap:16}}><Field label="Group name" value={name} onChangeText={setName} maxLength={70} placeholder="Weekend art club"/><Field label="Invite mutual followers" hint="Choose up to 19 friends who follow you back. Their messaging and invitation preferences are respected." value={handles} onChangeText={setHandles} multiline placeholder="@mira, @jun, @leo"/><Button busy={busy} disabled={name.trim().length<3||!handles.trim()} label="Create private group" onPress={()=>void create()}/></View></Card></Screen></View>;}
