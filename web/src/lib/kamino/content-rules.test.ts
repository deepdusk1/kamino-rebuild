import { test } from "node:test";
import assert from "node:assert/strict";
import { checkedContentMedia, safeFilename, captionsToVtt } from "./content-rules.ts";

test("uploads reject active document types and MIME masquerading",()=>{
  assert.throws(()=>checkedContentMedia("file","data:text/html;base64,PHNjcmlwdD4="),/supported/);
  assert.throws(()=>checkedContentMedia("gif","data:image/gif;base64,PHNjcmlwdD4="),/valid GIF/);
  assert.throws(()=>checkedContentMedia("file","data:application/pdf;base64,PHNjcmlwdD4="),/PDF/);
  assert.throws(()=>checkedContentMedia("image","data:image/jpeg;base64,PHNjcmlwdD4="),/JPEG/);
  assert.throws(()=>checkedContentMedia("audio","data:audio/mpeg;base64,"),/under/);
});
test("GIF animation is preserved and file upload limits enforced",()=>{
  const gif="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  assert.equal(checkedContentMedia("gif",gif).mime,"image/gif");
  assert.throws(()=>checkedContentMedia("file",`data:text/plain;base64,${"YQ==".repeat(3_000_000)}`),/supported/);
  assert.throws(()=>checkedContentMedia("file",`data:text/plain;base64,${"YWFh".repeat(3_000_000)}`),/under 8 MB/);
});
test("download filenames and captions cannot inject response headers or cues",()=>{
  assert.equal(safeFilename('../"bad\r\nname.pdf'),'..__bad__name.pdf');
  assert.equal(safeFilename(""),"attachment");
  const vtt=captionsToVtt("Hello\n01 --> bad");
  assert.ok(vtt.startsWith("WEBVTT\n\n00:00:00.000 -->"));
  assert.equal((vtt.match(/-->/g)??[]).length,1);
});

const dataUrl=(mime:string,bytes:Uint8Array|string)=>`data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
test("video and audio reject a supported MIME when the container signature is wrong",()=>{
  for(const [kind,mime] of [["video","video/mp4"],["short","video/quicktime"],["video","video/3gpp"],["audio","audio/mp4"],["video","video/webm"],["audio","audio/webm"],["audio","audio/wav"],["audio","audio/ogg"],["audio","audio/mpeg"],["audio","audio/aac"]]){
    assert.throws(()=>checkedContentMedia(kind!,dataUrl(mime!,"HTML masquerading as media")),/not valid/);
  }
});
test("supported video and audio container signatures are recognized without changing uploaded bytes",()=>{
  const mp4=Uint8Array.from([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0]);
  const ebml=Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x9f,0x42,0x86,0x81,0x01]);
  const cases:[string,string,Uint8Array|string][]=[
    ["video","video/mp4",mp4],["short","video/quicktime",mp4],["video","video/3gpp",mp4],["audio","audio/mp4",mp4],
    ["video","video/webm",ebml],["audio","audio/webm",ebml],
    ["audio","audio/wav","RIFF1234WAVEfmt "],["audio","audio/ogg","OggS12345678"],
    ["audio","audio/mpeg","ID3\x04\x00\x00"],["audio","audio/mpeg",Uint8Array.from([255,251,144,100])],
    ["audio","audio/aac",Uint8Array.from([255,241,80,128])],
  ];
  for(const [kind,mime,bytes] of cases){const original=dataUrl(mime,bytes);const checked=checkedContentMedia(kind,original);assert.equal(checked.mime,mime);assert.equal(checked.bytes,Buffer.from(bytes).length);}
});
test("timed WEBVTT captions retain separate cues and normalize line endings",()=>{
  const timed="WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nFirst sentence\r\n\r\n00:00:03.000 --> 00:00:05.000\r\nSecond sentence\r\n";
  const output=captionsToVtt(timed);
  assert.equal(output,timed.replace(/\r/g,""));
  assert.equal((output.match(/-->/g)??[]).length,2);
  assert.ok(captionsToVtt("WEBVTT\n"+"x".repeat(13000)).length<=12001);
});
