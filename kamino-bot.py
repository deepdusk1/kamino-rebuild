#!/usr/bin/env python3
"""kamino-bot.py — CLI for the Kamino Bot API.

A bot is a regular Kamino user account with a long-lived bearer token.
The bot can list its rooms, poll for new messages, and post messages —
only where its account is a member.

Setup:
  export KAMINO_BOT_TOKEN="kamino_bot_..."
  (or store it in ~/.config/kamino-bot/token)

Usage:
  kamino-bot.py rooms
  kamino-bot.py messages <room_id> [--since-id N] [--limit N]
  kamino-bot.py send <room_id> <text> [--reply-to MSG_ID]
"""
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

BASE_URL = os.environ.get("KAMINO_API_URL", "https://web-production-597bf.up.railway.app")

def get_token() -> str:
    token = os.environ.get("KAMINO_BOT_TOKEN", "").strip()
    if token:
        return token
    cfg = Path.home() / ".config" / "kamino-bot" / "token"
    if cfg.exists():
        return cfg.read_text().strip()
    print("Error: set KAMINO_BOT_TOKEN or store it in ~/.config/kamino-bot/token", file=sys.stderr)
    sys.exit(1)

def api(action: str, payload: dict | None = None, timeout: int = 30):
    token = get_token()
    url = f"{BASE_URL}/api/v1/bot/{action}"
    data = json.dumps(payload or {}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:
            return {"error": {"message": f"HTTP {e.code}", "status": e.code}}

def cmd_rooms():
    out = api("rooms")
    if out.get("error"):
        print(f"Error: {out['error']['message']}", file=sys.stderr)
        sys.exit(1)
    for r in out.get("result", []):
        print(f"{r['id']}\t{r['kind']}\t{r['name']}")

def cmd_messages(room_id: str, since_id: int = 0, limit: int = 50):
    out = api("messages", {"roomId": int(room_id), "sinceId": since_id, "limit": limit})
    if out.get("error"):
        print(f"Error: {out['error']['message']}", file=sys.stderr)
        sys.exit(1)
    for m in out.get("result", []):
        tag = "[bot]" if m["fromBot"] else ""
        reply = f" (reply to {m['replyTo']})" if m["replyTo"] else ""
        print(f"#{m['id']} {m['authorUserId'][:8]} {tag}{reply} {m['createdAt']}")
        print(f"  {m['body'][:300]}")

def cmd_send(room_id: str, text: str, reply_to: int | None = None):
    payload: dict = {"roomId": int(room_id), "body": text}
    if reply_to:
        payload["replyTo"] = reply_to
    out = api("send", payload)
    if out.get("error"):
        print(f"Error: {out['error']['message']}", file=sys.stderr)
        sys.exit(1)
    result = out.get("result", {})
    print(f"Sent as message #{result.get('id')}" + (" (held for review)" if result.get("held") else ""))

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "rooms":
        cmd_rooms()
    elif cmd == "messages":
        if len(sys.argv) < 3:
            print("Usage: kamino-bot.py messages <room_id> [--since-id N] [--limit N]", file=sys.stderr)
            sys.exit(1)
        since_id = 0
        limit = 50
        args = sys.argv[3:]
        for i, a in enumerate(args):
            if a == "--since-id" and i + 1 < len(args):
                since_id = int(args[i + 1])
            elif a == "--limit" and i + 1 < len(args):
                limit = int(args[i + 1])
        cmd_messages(sys.argv[2], since_id, limit)
    elif cmd == "send":
        if len(sys.argv) < 4:
            print("Usage: kamino-bot.py send <room_id> <text> [--reply-to MSG_ID]", file=sys.stderr)
            sys.exit(1)
        reply_to = None
        args = sys.argv[4:]
        for i, a in enumerate(args):
            if a == "--reply-to" and i + 1 < len(args):
                reply_to = int(args[i + 1])
        cmd_send(sys.argv[2], sys.argv[3], reply_to)
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
