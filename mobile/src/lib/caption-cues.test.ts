import test from "node:test";
import assert from "node:assert/strict";
import {captionAt,captionCues} from "./caption-cues.ts";
test("native captions respect timestamp boundaries and WebVTT cue identifiers",()=>{
  const cues=captionCues("WEBVTT\n\nfirst\n00:00:01.000 --> 00:00:02.500 line:90%\nHello <b>world</b> &amp; friends\n\n00:02.500 --> 00:04.000\nNext line");
  assert.equal(captionAt(cues,.5),"");assert.equal(captionAt(cues,1),"Hello world & friends");assert.equal(captionAt(cues,2.5),"Next line");assert.equal(captionAt(cues,4),"");
});
test("malformed timings and metadata never become caption cues",()=>{
  const cues=captionCues("WEBVTT\n\nNOTE\n00:00.000 --> 00:03.000\nPrivate note\n\n00:70.000 --> 00:90.000\nInvalid\n\n00:05.000 --> 00:01.000\nBackward");
  assert.deepEqual(cues,[]);assert.equal(captionAt(cues,NaN),"");
});
test("plain transcripts have the same ten-minute fallback as browser caption tracks",()=>{
  const cues=captionCues("A bird --> tweets");assert.equal(captionAt(cues,0),"A bird → tweets");assert.equal(captionAt(cues,600),"");
});
