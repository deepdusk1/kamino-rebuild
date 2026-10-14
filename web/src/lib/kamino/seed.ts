import type { Sql } from "@/lib/db";

const USERS = [
  { id: "seed:mira", handle: "mira", name: "Mira K.", hue: 210, bio: "Night-shift animator. Collects ending themes." },
  { id: "seed:jun", handle: "junpark", name: "Jun Park", hue: 252, bio: "Lightstick historian. Seoul / Vancouver." },
  { id: "seed:elio", handle: "eliovoss", name: "Elio Voss", hue: 188, bio: "Writes systems, runs one-shots on Sundays." },
  { id: "seed:nori", handle: "nori", name: "Nori", hue: 168, bio: "Fanfic archivist. Slow burn only." },
  { id: "seed:sage", handle: "sagewire", name: "Sage", hue: 228, bio: "Cosplay engineer. Foam, LEDs, patience." },
  { id: "seed:valen", handle: "valen", name: "Valen", hue: 200, bio: "Forever GM. Dice go where they must." },
] as const;

export const COMMUNITIES = [
  {
    id: "starlight",
    name: "Starlight Frames",
    tagline: "Anime, stills, and the scenes that stay.",
    description:
      "A quiet hall for people who pause the episode. Frames, OSTs, theories, and original work. No spoilers in titles.",
    category: "Anime",
    cover: "/covers/starlight.jpg",
    hue: 218,
    visibility: "public",
    ageGate: 18,
    contentWarnings: ["spoilers"],
    rules: "Mark spoilers. Credit artists. No piracy links. Be kind in theory threads.",
    createdBy: "seed:mira",
  },
  {
    id: "midnight-stage",
    name: "Midnight Stage",
    tagline: "Comebacks, fancams, and the walk home after.",
    description:
      "K-pop and live performance, tracked like a craft. Schedules, vocal analysis, and a no-fanwar floor.",
    category: "Music",
    cover: "/covers/midnight-stage.jpg",
    hue: 248,
    visibility: "public",
    ageGate: 18,
    contentWarnings: [],
    rules: "No fanwars. No leaking. Tag unreleased. Critique the work, not the people.",
    createdBy: "seed:jun",
  },
  {
    id: "pixel-realms",
    name: "Pixel Realms",
    tagline: "Games, builds, and the worlds we keep.",
    description:
      "From handhelds to sprawling MMO nights. Share clips, maps, and the one quest you never finished.",
    category: "Games",
    cover: "/covers/pixel-realms.jpg",
    hue: 196,
    visibility: "public",
    ageGate: 18,
    contentWarnings: ["flashing lights"],
    rules: "No cheats for live services. Tag spoilers. LFG posts need timezone + rank.",
    createdBy: "seed:elio",
  },
  {
    id: "ink-lore",
    name: "Ink & Lore",
    tagline: "Longform, slow burn, and the notes in the margin.",
    description:
      "Fanfiction, original fiction, and the craft of keeping a world on paper. Workshops welcome.",
    category: "Writing",
    cover: "/covers/ink-lore.jpg",
    hue: 28,
    visibility: "public",
    ageGate: 18,
    contentWarnings: ["mature themes"],
    rules: "Age 16+. Tag ratings. No AI-dumped novels. Critique with examples.",
    createdBy: "seed:nori",
  },
  {
    id: "atelier",
    name: "Atelier",
    tagline: "Costume, foam, thread, light.",
    description:
      "A shop floor for makers. Progress shots, pattern notes, and the wig that almost won.",
    category: "Art",
    cover: "/covers/atelier.jpg",
    hue: 320,
    visibility: "public",
    ageGate: 18,
    contentWarnings: [],
    rules: "Credit references. Safety first with tools and chemicals. No stolen patterns sold as original.",
    createdBy: "seed:sage",
  },
  {
    id: "nightwatch",
    name: "Nightwatch",
    tagline: "In-character after dark.",
    description:
      "A literate roleplay keep. Turn order in rooms that ask for it. OOC stays in the OOC wing.",
    category: "Roleplay",
    cover: "/covers/nightwatch.jpg",
    hue: 172,
    visibility: "public",
    ageGate: 18,
    contentWarnings: ["violence", "mature themes"],
    rules: "Age 16+. Consent for plots. No godmodding. Fade-to-black on request. OOC in OOC.",
    createdBy: "seed:valen",
  },
  {
    id: "vinyl-club",
    name: "Vinyl Club",
    tagline: "Listening rooms. Deep cuts. No skip.",
    description:
      "Records, analog, and the album you play all the way through. Weekly listens, liner notes, trades.",
    category: "Music",
    cover: "/covers/vinyl-club.jpg",
    hue: 32,
    visibility: "unlisted",
    ageGate: 18,
    contentWarnings: [],
    rules: "Finish the album. No shaming taste. Tag live rips.",
    createdBy: "seed:jun",
  },
  {
    id: "keep",
    name: "The Keep",
    tagline: "Maps, dice, and the table that still has snacks.",
    description:
      "TTRPGs of every edition. Session recaps, homebrew, and looking-for-table posts that actually list the system.",
    category: "Tabletop",
    cover: "/covers/keep.jpg",
    hue: 36,
    visibility: "public",
    ageGate: 18,
    contentWarnings: [],
    rules: "Name the system. No pay-to-win table ads. Safety tools listed in LFG.",
    createdBy: "seed:valen",
  },
  {
    id: "inner-circle",
    name: "Inner Circle",
    tagline: "Leaders only. Quiet ops.",
    description:
      "A private staff hall for people running public spaces. Join is request-only.",
    category: "Lifestyle",
    cover: "/covers/hero.jpg",
    hue: 230,
    visibility: "private",
    ageGate: 18,
    contentWarnings: [],
    rules: "Private. No screenshots of reports. Assume good faith. Escalate, don’t pile on.",
    createdBy: "seed:mira",
  },
] as const;

type SeedPost = {
  community: string;
  author: string;
  type: string;
  title: string;
  body: string;
  cover?: string;
  payload?: unknown;
  featured?: boolean;
  warning?: string;
  hoursAgo: number;
};

const POSTS: SeedPost[] = [
  {
    community: "starlight",
    author: "seed:mira",
    type: "blog",
    title: "The 12-frame hold that ruins me every time",
    body: "There’s a cut in episode 7 where the train doors close and the camera stays. No score swell. Just the reflection in the glass, then a blink. I still don’t know if it was budget or mercy.\n\nIf you know the show, you know. If you don’t: go in cold, and don’t scroll the wiki first.",
    cover: "/covers/starlight.jpg",
    featured: true,
    warning: "spoilers",
    hoursAgo: 5,
  },
  {
    community: "starlight",
    author: "seed:nori",
    type: "wiki",
    title: "House style: spoiler tags",
    body: "Titles stay clean. First line of the body can carry the warning. Episode numbers belong in the first sentence, not the headline. Featured posts are curated by people, not a model.",
    payload: { category: "Guidelines" },
    featured: true,
    hoursAgo: 40,
  },
  {
    community: "starlight",
    author: "seed:elio",
    type: "poll",
    title: "Best first-episode hook?",
    body: "Cold open, or title card then world?",
    payload: { options: ["Cold open, no mercy", "Title card, then quiet", "In medias res", "A letter, then the story"] },
    hoursAgo: 12,
  },
  {
    community: "starlight",
    author: "seed:mira",
    type: "quiz",
    title: "Opening theme or ending theme?",
    body: "A short one. Be honest.",
    payload: {
      questions: [
        { q: "You rewatch a show for the…", choices: ["OP animation", "ED that finally lands", "insert song in ep 11", "silence"], answer: 1 },
        { q: "Best place for a sakuga flex?", choices: ["Fight 1", "A door closing", "The last 3 seconds of the ED", "Eyecatch"], answer: 2 },
        { q: "Sub or dub for a first watch?", choices: ["Sub", "Dub", "Both, different nights", "Whatever the room picked"], answer: 2 },
      ],
    },
    hoursAgo: 20,
  },
  {
    community: "midnight-stage",
    author: "seed:jun",
    type: "blog",
    title: "Lightsticks as architecture",
    body: "A packed arena is a circuit. The kit color is a voltage. If you’ve stood at the back and watched the wave start from one section, you already know this is engineering, not just merch.\n\nThis week: how three tours used the same hall and made it three different rooms.",
    cover: "/covers/midnight-stage.jpg",
    featured: true,
    hoursAgo: 8,
  },
  {
    community: "midnight-stage",
    author: "seed:sage",
    type: "image",
    title: "Rig notes from the floor",
    body: "Foam core, EL wire, a 5V pack that actually lasted the encore. Build log in comments if anyone wants the stitch count.",
    cover: "/covers/atelier.jpg",
    featured: true,
    hoursAgo: 26,
  },
  {
    community: "midnight-stage",
    author: "seed:jun",
    type: "poll",
    title: "Where do you stand?",
    body: "Be specific in comments if you pick other.",
    payload: { options: ["Front barrier", "Sound booth line", "Upper bowl, whole stage", "At home, one camera, no crop"] },
    hoursAgo: 3,
  },
  {
    community: "pixel-realms",
    author: "seed:elio",
    type: "blog",
    title: "A map that refuses to end",
    body: "I built a coastal keep for a three-session arc. It’s month four. The players named the gulls. There is a ledger for fish. I am not mad. I am concerned.\n\nHere’s the elevation sketch and the rule I will not break: no teleport without a cost.",
    cover: "/covers/pixel-realms.jpg",
    featured: true,
    hoursAgo: 9,
  },
  {
    community: "pixel-realms",
    author: "seed:valen",
    type: "wiki",
    title: "LFG template",
    body: "System / edition. Timezone. Session length. Tone (goof, grim, mystery). Safety tools. Voice or text. What you will not run.",
    payload: { category: "Tables" },
    hoursAgo: 50,
  },
  {
    community: "pixel-realms",
    author: "seed:elio",
    type: "quiz",
    title: "What kind of player are you after midnight?",
    body: "No wrong answers. Some concerning ones.",
    payload: {
      questions: [
        { q: "The chest is probably trapped.", choices: ["Open it", "Prod with a stick", "Ask the bard to sing at it", "Leave. We have plot."], answer: 1 },
        { q: "Your HP is 2.", choices: ["Heroic last stand", "Disengage and hide", "Negotiate", "Loot faster"], answer: 1 },
        { q: "Best loot is…", choices: ["A named sword", "A key with no door yet", "A rumor", "Snacks for the table"], answer: 2 },
      ],
    },
    hoursAgo: 16,
  },
  {
    community: "ink-lore",
    author: "seed:nori",
    type: "blog",
    title: "On keeping a second draft",
    body: "The first draft is a letter to yourself. The second is a letter to a stranger who already loves the characters more than you do. Cut the apologies. Leave the weather if it does work.\n\nWorkshop in the comments: first 300 words, rating in the header.",
    cover: "/covers/ink-lore.jpg",
    featured: true,
    warning: "mature themes",
    hoursAgo: 6,
  },
  {
    community: "ink-lore",
    author: "seed:mira",
    type: "wiki",
    title: "Rating and archive tags",
    body: "G / T / M / E. Pairing. Major warnings up top. Don’t hide a death in chapter 12 without a tag. We are not a surprise factory.",
    payload: { category: "Craft" },
    featured: true,
    hoursAgo: 70,
  },
  {
    community: "atelier",
    author: "seed:sage",
    type: "blog",
    title: "The wig that almost won",
    body: "Three ventilating nights. One bad dye bath. A train ride with the head in a hat box. Progress photos below, plus the mistake I would not repeat: mixing acetone near a hotel carpet.",
    cover: "/covers/atelier.jpg",
    featured: true,
    hoursAgo: 11,
  },
  {
    community: "atelier",
    author: "seed:sage",
    type: "poll",
    title: "Next build",
    body: "Vote the bench.",
    payload: { options: ["Armor, foam", "Ballgown, no sleep", "Prop staff with LEDs", "Something tiny and precise"] },
    hoursAgo: 4,
  },
  {
    community: "nightwatch",
    author: "seed:valen",
    type: "blog",
    title: "Opening night: the lanterns stay unlit",
    body: "OOC: slow start, 3rd person, past tense. Fade on request. Characters in the wiki. The clearing is open.\n\nIC: The fog did not lift. Someone had already walked the circle once.",
    cover: "/covers/nightwatch.jpg",
    featured: true,
    warning: "violence",
    hoursAgo: 7,
  },
  {
    community: "nightwatch",
    author: "seed:nori",
    type: "wiki",
    title: "Character: Ash-of-the-Gate",
    body: "A keeper who does not enter the hall. Soft-spoken. Will not lie, will omit. Want: a name that isn’t a function. Fear: the lanterns lighting without a witness.",
    payload: { category: "Characters" },
    hoursAgo: 14,
  },
  {
    community: "vinyl-club",
    author: "seed:jun",
    type: "blog",
    title: "This week’s listen: one side, no skip",
    body: "Side A only. Lights down. If you have to talk, talk after the runout groove. Notes in the thread, not during.",
    cover: "/covers/vinyl-club.jpg",
    featured: true,
    hoursAgo: 2,
  },
  {
    community: "keep",
    author: "seed:valen",
    type: "blog",
    title: "Sunday one-shot: the ferry that shouldn’t exist",
    body: "System: a light mystery ruleset. 3 hours. Tone: fog, ledgers, no gore. Safety: lines and veils in the first ten minutes. Two seats left.",
    cover: "/covers/keep.jpg",
    featured: true,
    hoursAgo: 15,
  },
  {
    community: "keep",
    author: "seed:elio",
    type: "wiki",
    title: "House tools",
    body: "X-card. Lines/veils. Pause. No surprises involving kids, torture, or spiders (yes, spiders). Food on the side table, not on the map.",
    payload: { category: "Safety" },
    hoursAgo: 60,
  },
  {
    community: "keep",
    author: "seed:valen",
    type: "quiz",
    title: "Identify the system from the rumor",
    body: "A little cruel. A little fair.",
    payload: {
      questions: [
        { q: "You have six stats and a dream.", choices: ["A dungeon crawl", "A power fantasy", "A conversation with dice", "A war game"], answer: 2 },
        { q: "Failing forward means…", choices: ["You still get it", "The story tilts", "Reroll", "The GM smiles"], answer: 1 },
        { q: "The map is blank because…", choices: ["Budget", "The west marches", "You haven’t drawn it yet", "It’s a trap"], answer: 1 },
      ],
    },
    hoursAgo: 22,
  },
  {
    community: "starlight",
    author: "seed:nori",
    type: "story",
    title: "Tonight’s still",
    body: "A hallway. Two vending machines. The sound of a train you cannot see.",
    cover: "/covers/starlight.jpg",
    hoursAgo: 1,
  },
];

const ROOMS: { community: string; name: string; kind: string; by: string }[] = [
  { community: "starlight", name: "lobby", kind: "public", by: "seed:mira" },
  { community: "starlight", name: "spoiler lounge", kind: "public", by: "seed:mira" },
  { community: "starlight", name: "screening", kind: "screening", by: "seed:mira" },
  { community: "midnight-stage", name: "lobby", kind: "public", by: "seed:jun" },
  { community: "midnight-stage", name: "voice — after show", kind: "voice", by: "seed:jun" },
  { community: "pixel-realms", name: "lobby", kind: "public", by: "seed:elio" },
  { community: "pixel-realms", name: "lfg", kind: "public", by: "seed:elio" },
  { community: "ink-lore", name: "workshop", kind: "public", by: "seed:nori" },
  { community: "atelier", name: "bench", kind: "public", by: "seed:sage" },
  { community: "nightwatch", name: "ooc", kind: "public", by: "seed:valen" },
  { community: "nightwatch", name: "the clearing", kind: "public", by: "seed:valen" },
  { community: "vinyl-club", name: "listening room", kind: "public", by: "seed:jun" },
  { community: "keep", name: "tavern", kind: "public", by: "seed:valen" },
  { community: "keep", name: "voice table", kind: "voice", by: "seed:valen" },
  { community: "inner-circle", name: "ops", kind: "private", by: "seed:mira" },
];

/**
 * Set KAMINO_SAMPLE_CONTENT=off on a real (public) server to start with an empty site instead of
 * the built-in starter communities, sample members and sample posts.
 */
const sampleContentOff = () =>
  typeof process !== "undefined" && ["off", "0", "false", "no"].includes((process.env.KAMINO_SAMPLE_CONTENT ?? "").toLowerCase());

export async function ensureSeeded(sql: Sql): Promise<void> {
  if (sampleContentOff()) return;
  const flag = await sql<{ value: string }>`select value from app_meta where key = 'seeded'`;
  if (flag.length) {
    await ensureCharacters(sql);
    await ensureProfileParity(sql);
    await ensureAminoComplete(sql);
    await ensureRedesignDemo(sql);
    return;
  }

  for (const u of USERS) {
    await sql`
      insert into profiles (user_id, handle, display_name, bio, avatar_hue, age_confirmed, rep, streak)
      values (${u.id}, ${u.handle}, ${u.name}, ${u.bio}, ${u.hue}, true, ${80 + u.hue / 2}, 4)
      on conflict (user_id) do nothing
    `;
  }

  for (const c of COMMUNITIES) {
    const warnings = JSON.stringify(c.contentWarnings);
    await sql`
      insert into communities (
        id, name, tagline, description, category, cover, hue, visibility, age_gate, content_warnings, rules, created_by, member_count
      ) values (
        ${c.id}, ${c.name}, ${c.tagline}, ${c.description}, ${c.category}, ${c.cover}, ${c.hue},
        ${c.visibility}, ${c.ageGate}, ${warnings}, ${c.rules}, ${c.createdBy}, 0
      )
      on conflict (id) do nothing
    `;
  }

  const memberships: { user: string; community: string; role: string; nick: string; hue: number }[] = [
    { user: "seed:mira", community: "starlight", role: "agent", nick: "Mira", hue: 210 },
    { user: "seed:nori", community: "starlight", role: "curator", nick: "Nori", hue: 168 },
    { user: "seed:elio", community: "starlight", role: "member", nick: "Elio", hue: 188 },
    { user: "seed:jun", community: "starlight", role: "member", nick: "Jun", hue: 252 },
    { user: "seed:jun", community: "midnight-stage", role: "agent", nick: "Jun", hue: 252 },
    { user: "seed:sage", community: "midnight-stage", role: "curator", nick: "Sage", hue: 228 },
    { user: "seed:mira", community: "midnight-stage", role: "member", nick: "Mira", hue: 210 },
    { user: "seed:elio", community: "pixel-realms", role: "agent", nick: "Elio", hue: 196 },
    { user: "seed:valen", community: "pixel-realms", role: "leader", nick: "Valen", hue: 200 },
    { user: "seed:nori", community: "ink-lore", role: "agent", nick: "Nori", hue: 28 },
    { user: "seed:mira", community: "ink-lore", role: "member", nick: "Mira", hue: 210 },
    { user: "seed:sage", community: "atelier", role: "agent", nick: "Sage", hue: 320 },
    { user: "seed:jun", community: "atelier", role: "member", nick: "Jun", hue: 252 },
    { user: "seed:valen", community: "nightwatch", role: "agent", nick: "Valen", hue: 172 },
    { user: "seed:nori", community: "nightwatch", role: "curator", nick: "Ash", hue: 168 },
    { user: "seed:elio", community: "nightwatch", role: "member", nick: "Ferry", hue: 188 },
    { user: "seed:jun", community: "vinyl-club", role: "agent", nick: "Jun", hue: 32 },
    { user: "seed:mira", community: "vinyl-club", role: "member", nick: "Mira", hue: 210 },
    { user: "seed:valen", community: "keep", role: "agent", nick: "Valen", hue: 36 },
    { user: "seed:elio", community: "keep", role: "leader", nick: "Elio", hue: 196 },
    { user: "seed:sage", community: "keep", role: "member", nick: "Sage", hue: 228 },
    { user: "seed:mira", community: "inner-circle", role: "agent", nick: "Mira", hue: 230 },
    { user: "seed:jun", community: "inner-circle", role: "leader", nick: "Jun", hue: 248 },
    { user: "seed:valen", community: "inner-circle", role: "leader", nick: "Valen", hue: 200 },
  ];

  for (const m of memberships) {
    await sql`
      insert into memberships (user_id, community_id, role, status, nickname, persona_hue, rep)
      values (${m.user}, ${m.community}, ${m.role}, 'active', ${m.nick}, ${m.hue}, 40)
      on conflict (user_id, community_id) do nothing
    `;
  }

  await sql`
    update communities c set member_count = (
      select count(*) from memberships m where m.community_id = c.id and m.status = 'active'
    )
  `;

  for (const p of POSTS) {
    const created = new Date(Date.now() - p.hoursAgo * 3600 * 1000).toISOString();
    const expires =
      p.type === "story" ? new Date(Date.now() + 20 * 3600 * 1000).toISOString() : null;
    const payload = JSON.stringify(p.payload ?? {});
    await sql`
      insert into posts (
        community_id, author_user_id, type, title, body, cover, payload, featured, content_warning, expires_at, created_at, like_count, comment_count
      ) values (
        ${p.community}, ${p.author}, ${p.type}, ${p.title}, ${p.body}, ${p.cover ?? ""}, ${payload},
        ${p.featured ?? false}, ${p.warning ?? ""}, ${expires}, ${created}, ${3 + (p.featured ? 12 : 0)}, ${p.featured ? 4 : 1}
      )
    `;
  }

  const postRows = await sql<{ id: number; community_id: string; author_user_id: string }>`
    select id, community_id, author_user_id from posts order by id
  `;
  const comments = [
    "This is the one I think about on the bus.",
    "Marked. Going in cold.",
    "The hold is the whole thesis.",
    "Need the stitch count when you have it.",
    "Timezone is PT. I can do Sundays.",
    "Lines and veils listed. I’m in.",
    "Side A only is the correct religion.",
    "Ash would not say that out loud. She would wait.",
  ];
  let ci = 0;
  for (const post of postRows.slice(0, 12)) {
    const author = USERS[(ci + 2) % USERS.length]!.id;
    if (author === post.author_user_id) continue;
    await sql`
      insert into comments (post_id, author_user_id, body, created_at)
      values (${post.id}, ${author}, ${comments[ci % comments.length]}, ${new Date(Date.now() - (ci + 1) * 1800 * 1000).toISOString()})
    `;
    ci += 1;
  }

  for (const r of ROOMS) {
    await sql`
      insert into chat_rooms (community_id, name, kind, created_by)
      values (${r.community}, ${r.name}, ${r.kind}, ${r.by})
    `;
  }

  const rooms = await sql<{ id: number; community_id: string; name: string }>`
    select id, community_id, name from chat_rooms
  `;
  const lobbyMsgs: Record<string, string[]> = {
    lobby: [
      "Evening. Spoilers stay in the other room.",
      "Someone queued the ED. I’m not sorry.",
      "If you’re new: read the wiki, then say hi.",
    ],
    "spoiler lounge": ["Okay. Episode 7. The doors.", "I felt that in my teeth."],
    tavern: ["Dice are in the tray. Who’s eating the last bun?", "Ferry one-shot still has two seats."],
    workshop: ["Drop 300 words. Rating in the header.", "I’ll read after tea."],
    bench: ["Acetone is banned near the carpet. Learn from me."],
    "the clearing": ["*the fog does not lift*", "ooc — wait for valen’s pass"],
    "listening room": ["Needle down. See you on the runout."],
    ops: ["Reports are human-reviewed. No auto-ban this week.", "Private community join queue is quiet."],
  };

  for (const room of rooms) {
    const lines = lobbyMsgs[room.name] ?? ["Room is open."];
    const members = await sql<{ user_id: string }>`
      select user_id from memberships where community_id = ${room.community_id} and status = 'active'
    `;
    for (const mem of members) {
      await sql`
        insert into chat_members (room_id, user_id, in_voice)
        values (${room.id}, ${mem.user_id}, ${room.name.includes("voice") && mem.user_id !== "seed:sage"})
        on conflict do nothing
      `;
    }
    let i = 0;
    for (const line of lines) {
      const author = members[i % Math.max(members.length, 1)]?.user_id ?? "seed:mira";
      await sql`
        insert into messages (room_id, author_user_id, body, created_at)
        values (${room.id}, ${author}, ${line}, ${new Date(Date.now() - (lines.length - i) * 600000).toISOString()})
      `;
      i += 1;
    }
  }

  await sql`insert into app_meta (key, value) values ('seeded', '1') on conflict (key) do nothing`;
  await ensureCharacters(sql);
  await ensureProfileParity(sql);
  await ensureAminoComplete(sql);
  await ensureRedesignDemo(sql);
}

/** Sample headlines, ticks, interests and community topics for the redesigned screens (runs once). */
async function ensureRedesignDemo(sql: Sql): Promise<void> {
  try {
    const done = await sql`select 1 from app_meta where key = 'redesign-demo'`;
    if (done.length) return;
    const people: { id: string; headline: string; pronouns: string; location: string; interests: string[]; categories: string[]; verified: boolean; creator: boolean }[] = [
      { id: "seed:mira", headline: "Digital Artist", pronouns: "she/her", location: "Vancouver", interests: ["anime", "art", "music"], categories: ["art", "daily", "milestones", "qa"], verified: true, creator: true },
      { id: "seed:jun", headline: "K-Pop Historian", pronouns: "he/him", location: "Seoul", interests: ["kpop", "music"], categories: ["music", "daily", "reviews"], verified: true, creator: true },
      { id: "seed:elio", headline: "Game Designer", pronouns: "", location: "Montreal", interests: ["gaming", "tech"], categories: ["gaming", "growth"], verified: false, creator: true },
      { id: "seed:nori", headline: "Fanfic Archivist", pronouns: "they/them", location: "", interests: ["writing", "books", "anime"], categories: ["fanfic", "writing"], verified: false, creator: false },
      { id: "seed:sage", headline: "Cosplay Engineer", pronouns: "", location: "Calgary", interests: ["art", "fashion"], categories: ["cosplay", "photos", "growth"], verified: false, creator: false },
      { id: "seed:valen", headline: "Forever GM", pronouns: "he/they", location: "", interests: ["gaming", "writing"], categories: ["gaming", "milestones"], verified: false, creator: false },
    ];
    for (const p of people) {
      await sql`
        update profiles set headline = ${p.headline}, pronouns = ${p.pronouns}, location = ${p.location},
          interests = ${JSON.stringify(p.interests)}, profile_categories = ${JSON.stringify(p.categories)},
          verified = ${p.verified}, creator = ${p.creator}, onboarded_at = coalesce(onboarded_at, now())
        where user_id = ${p.id} and headline = ''`;
    }
    const topics: Record<string, string[]> = {
      starlight: ["Frames", "OST", "Theories", "Fan Art"],
      "midnight-stage": ["Comebacks", "Fancams", "Vocal Analysis", "K-Pop"],
      "pixel-realms": ["Clips", "Builds", "LFG", "Gaming"],
      "ink-lore": ["Fanfic", "Workshops", "Slow Burn", "Books"],
      atelier: ["Cosplay", "Foam", "Wigs", "Photography"],
      nightwatch: ["Roleplay", "Lore", "Writing"],
      "vinyl-club": ["Records", "Deep Cuts", "Music"],
      keep: ["Tabletop", "One-shots", "Gaming"],
    };
    for (const [id, list] of Object.entries(topics))
      await sql`update communities set topics = ${JSON.stringify(list)} where id = ${id} and topics = '[]'`;
    await sql`update communities set verified = true where id in ('starlight', 'midnight-stage')`;
    await sql`update chat_rooms set topic = 'Music' where kind = 'voice' and community_id = 'midnight-stage' and topic = ''`;
    await sql`update chat_rooms set topic = 'Gaming' where kind = 'voice' and community_id = 'keep' and topic = ''`;
    await sql`update chat_rooms set topic = 'Anime' where kind = 'screening' and community_id = 'starlight' and topic = ''`;
    await sql`insert into app_meta (key, value) values ('redesign-demo', '1') on conflict (key) do nothing`;
  } catch {
    // The redesign columns arrive with migration 0024.
  }
}

async function ensureCharacters(sql: Sql): Promise<void> {
  try {
    const existing = await sql`select 1 from characters limit 1`;
    if (existing.length) return;
    const rows: { user: string; name: string; fandom: string; bio: string; appearance: string; hue: number }[] = [
      {
        user: "seed:nori",
        name: "Ash-of-the-Gate",
        fandom: "Nightwatch",
        bio: "A keeper who does not enter the hall. Soft-spoken. Will not lie, will omit.",
        appearance: "Ash-grey cloak, lantern unlit, gloves that never come off.",
        hue: 168,
      },
      {
        user: "seed:valen",
        name: "Ferry",
        fandom: "The Keep",
        bio: "Runs the boat that shouldn’t exist. Collects unfinished names.",
        appearance: "Salt coat, one gold tooth, a ledger instead of a map.",
        hue: 200,
      },
      {
        user: "seed:elio",
        name: "Cartographer Nine",
        fandom: "Pixel Realms",
        bio: "Draws coasts that keep growing. Named three gulls last session.",
        appearance: "Ink on both wrists, a compass that only points inland.",
        hue: 188,
      },
    ];
    for (const c of rows) {
      await sql`
        insert into characters (user_id, name, fandom, bio, appearance, hue)
        values (${c.user}, ${c.name}, ${c.fandom}, ${c.bio}, ${c.appearance}, ${c.hue})
      `;
    }
  } catch {
    // Table may not exist until 0003 applies.
  }
}

async function ensureProfileParity(sql: Sql): Promise<void> {
  try {
    await sql`select cover from profiles limit 1`;
    await sql`select 1 from title_defs limit 1`;
  } catch {
    return;
  }

  const covers: { user: string; cover: string }[] = [
    { user: "seed:mira", cover: "/covers/starlight.jpg" },
    { user: "seed:jun", cover: "/covers/midnight-stage.jpg" },
    { user: "seed:elio", cover: "/covers/pixel-realms.jpg" },
    { user: "seed:nori", cover: "/covers/ink-lore.jpg" },
    { user: "seed:sage", cover: "/covers/atelier.jpg" },
    { user: "seed:valen", cover: "/covers/nightwatch.jpg" },
  ];
  for (const c of covers) {
    await sql`update profiles set cover = ${c.cover} where user_id = ${c.user} and cover = ''`;
  }
  await sql`update profiles set rep = greatest(rep, 480) where user_id = 'seed:mira'`;
  await sql`update profiles set streak = greatest(streak, 12) where user_id = 'seed:mira'`;

  const haveDefs = await sql`select 1 from title_defs limit 1`;
  if (haveDefs.length) return;

  const defs: { community: string; label: string; color: string; featured: boolean; by: string }[] = [
    { community: "starlight", label: "Champion", color: "#f5c15c", featured: true, by: "seed:mira" },
    { community: "starlight", label: "Frame keeper", color: "#8b6cff", featured: false, by: "seed:mira" },
    { community: "starlight", label: "Night owl", color: "#2ee6d6", featured: false, by: "seed:mira" },
    { community: "starlight", label: "Spoiler scout", color: "#ff6b9d", featured: false, by: "seed:mira" },
    { community: "midnight-stage", label: "Lightstick", color: "#ff6b9d", featured: true, by: "seed:jun" },
    { community: "midnight-stage", label: "Encore", color: "#5b8cff", featured: false, by: "seed:jun" },
    { community: "pixel-realms", label: "Cartographer", color: "#5dcc9a", featured: true, by: "seed:elio" },
    { community: "ink-lore", label: "Archivist", color: "#f4f0ff", featured: true, by: "seed:nori" },
    { community: "nightwatch", label: "Gate keeper", color: "#1a1228", featured: true, by: "seed:valen" },
    { community: "atelier", label: "Bench lead", color: "#ff8a4c", featured: true, by: "seed:sage" },
  ];
  const byKey = new Map<string, number>();
  for (const d of defs) {
    const row = await sql<{ id: number }>`
      insert into title_defs (community_id, label, color, featured, created_by)
      values (${d.community}, ${d.label}, ${d.color}, ${d.featured}, ${d.by})
      returning id
    `;
    byKey.set(`${d.community}:${d.label}`, Number(row[0]!.id));
  }

  const grants: { user: string; key: string; community: string; by: string; pinned?: boolean }[] = [
    { user: "seed:mira", key: "starlight:Champion", community: "starlight", by: "seed:mira", pinned: true },
    { user: "seed:mira", key: "starlight:Frame keeper", community: "starlight", by: "seed:mira" },
    { user: "seed:mira", key: "starlight:Night owl", community: "starlight", by: "seed:nori" },
    { user: "seed:mira", key: "ink-lore:Archivist", community: "ink-lore", by: "seed:nori" },
    { user: "seed:nori", key: "starlight:Spoiler scout", community: "starlight", by: "seed:mira" },
    { user: "seed:nori", key: "ink-lore:Archivist", community: "ink-lore", by: "seed:nori", pinned: true },
    { user: "seed:jun", key: "midnight-stage:Lightstick", community: "midnight-stage", by: "seed:jun", pinned: true },
    { user: "seed:jun", key: "midnight-stage:Encore", community: "midnight-stage", by: "seed:jun" },
    { user: "seed:elio", key: "pixel-realms:Cartographer", community: "pixel-realms", by: "seed:elio", pinned: true },
    { user: "seed:valen", key: "nightwatch:Gate keeper", community: "nightwatch", by: "seed:valen", pinned: true },
    { user: "seed:sage", key: "atelier:Bench lead", community: "atelier", by: "seed:sage", pinned: true },
  ];
  for (const g of grants) {
    const titleId = byKey.get(g.key);
    if (!titleId) continue;
    await sql`
      insert into member_titles (user_id, title_id, community_id, granted_by, pinned)
      values (${g.user}, ${titleId}, ${g.community}, ${g.by}, ${g.pinned ?? false})
      on conflict (user_id, title_id) do nothing
    `;
  }

  const follows: [string, string][] = [
    ["seed:jun", "seed:mira"],
    ["seed:nori", "seed:mira"],
    ["seed:elio", "seed:mira"],
    ["seed:sage", "seed:mira"],
    ["seed:valen", "seed:mira"],
    ["seed:mira", "seed:nori"],
    ["seed:mira", "seed:jun"],
    ["seed:elio", "seed:jun"],
    ["seed:sage", "seed:jun"],
    ["seed:nori", "seed:valen"],
  ];
  for (const [a, b] of follows) {
    await sql`
      insert into profile_follows (follower_id, followee_id) values (${a}, ${b})
      on conflict do nothing
    `;
  }

  const wall: { profile: string; author: string; body: string }[] = [
    { profile: "seed:mira", author: "seed:jun", body: "The 12-frame hold still lives rent-free. Champion of the pause button." },
    { profile: "seed:mira", author: "seed:nori", body: "Wiki is current. You’re welcome. Don’t let Elio rename the spoiler lounge." },
    { profile: "seed:mira", author: "seed:elio", body: "Come run a quiz in Pixel Realms. The gulls have a union now." },
    { profile: "seed:nori", author: "seed:mira", body: "Ash would wait. That’s the whole character. Beautiful page." },
    { profile: "seed:jun", author: "seed:sage", body: "Encore kit survived the rain. Notes are on the bench." },
  ];
  const haveWall = await sql`select 1 from wall_posts limit 1`;
  if (!haveWall.length) {
    let i = 0;
    for (const w of wall) {
      await sql`
        insert into wall_posts (profile_user_id, author_user_id, body, created_at)
        values (${w.profile}, ${w.author}, ${w.body}, ${new Date(Date.now() - (i + 2) * 3600 * 1000).toISOString()})
      `;
      i += 1;
    }
  }
}

async function ensureAminoComplete(sql: Sql): Promise<void> {
  try {
    await sql`select mood, frame, last_seen_at from profiles limit 1`;
    await sql`select 1 from events limit 1`;
  } catch {
    return;
  }

  await sql`
    update profiles
    set mood = case when mood = '' then 'late night frames' else mood end,
        status = case when status = '' then 'paused on the ED' else status end,
        frame = case when frame = 'ring' then 'moon' else frame end,
        last_seen_at = coalesce(last_seen_at, now()),
        bubble_hue = 265
    where user_id = 'seed:mira'
  `;
  await sql`
    update profiles
    set last_seen_at = coalesce(last_seen_at, now() - interval '40 minutes'),
        frame = case when user_id = 'seed:jun' then 'star' when user_id = 'seed:nori' then 'laurel' else frame end
    where user_id in ('seed:jun','seed:nori','seed:elio','seed:sage','seed:valen')
  `;

  const extra: { community: string; label: string; color: string; by: string }[] = [
    { community: "starlight", label: "Still hunter", color: "#ff6b9d", by: "seed:mira" },
    { community: "starlight", label: "Gold frame", color: "#ff8a4c", by: "seed:mira" },
    { community: "starlight", label: "Lore keeper", color: "#5dcc9a", by: "seed:mira" },
  ];
  for (const d of extra) {
    const have = await sql`select id from title_defs where community_id = ${d.community} and label = ${d.label}`;
    let id = have[0] ? Number(have[0].id) : 0;
    if (!id) {
      const row = await sql<{ id: number }>`
        insert into title_defs (community_id, label, color, featured, created_by)
        values (${d.community}, ${d.label}, ${d.color}, false, ${d.by})
        returning id
      `;
      id = Number(row[0]!.id);
    }
    await sql`
      insert into member_titles (user_id, title_id, community_id, granted_by)
      values ('seed:mira', ${id}, ${d.community}, ${d.by})
      on conflict (user_id, title_id) do nothing
    `;
  }

  const haveEvent = await sql`select 1 from events where community_id = 'starlight' limit 1`;
  if (!haveEvent.length) {
    await sql`
      insert into events (community_id, title, body, kind, starts_at, ends_at, created_by)
      values (
        'starlight',
        'Frame night — pause together',
        'Bring one still. No spoilers in titles. Voting in lobby after.',
        'event',
        ${new Date(Date.now() + 2 * 86400000).toISOString()},
        ${new Date(Date.now() + 3 * 86400000).toISOString()},
        'seed:mira'
      )
    `;
    await sql`
      insert into events (community_id, title, body, kind, starts_at, ends_at, created_by)
      values (
        'starlight',
        'Wiki week challenge',
        'Add or repair one wiki page. Curators feature the best.',
        'challenge',
        ${new Date(Date.now() - 86400000).toISOString()},
        ${new Date(Date.now() + 6 * 86400000).toISOString()},
        'seed:mira'
      )
    `;
  }

  const haveQ = await sql`select 1 from join_questions where community_id = 'inner-circle' limit 1`;
  if (!haveQ.length) {
    await sql`
      insert into join_questions (community_id, prompt, sort_order)
      values ('inner-circle', 'What hall do you already keep?', 0)
    `;
    await sql`
      insert into join_questions (community_id, prompt, sort_order)
      values ('inner-circle', 'Why this room, in one line?', 1)
    `;
  }

  const haveInvite = await sql`select 1 from invite_codes where community_id = 'inner-circle' limit 1`;
  if (!haveInvite.length) {
    await sql`
      insert into invite_codes (code, community_id, created_by, max_uses)
      values ('starlight', 'inner-circle', 'seed:mira', 20)
    `;
  }

  const haveBroadcast = await sql`select 1 from broadcasts where community_id = 'starlight' limit 1`;
  if (!haveBroadcast.length) {
    await sql`
      insert into broadcasts (community_id, author_user_id, body)
      values ('starlight', 'seed:mira', 'Spoiler lounge is open after episode 7. Titles stay clean on home.')
    `;
  }

  await sql`
    update posts
    set hashtags = '["still","ost"]', announcement = true, pinned = true
    where community_id = 'starlight' and featured = true and type = 'blog'
      and announcement = false
  `;
  await sql`
    update posts
    set hashtags = '["quiz","frames"]'
    where type = 'quiz' and hashtags = '[]'
  `;

  try {
    await sql`
      update chat_rooms
      set watch_url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          watch_title = 'Sintel'
      where kind = 'screening' and watch_url = ''
    `;
  } catch {
    /* 0007 pending */
  }
}


