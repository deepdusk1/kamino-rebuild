/**
 * The English catalog is the source of truth: every key the interface may translate is declared
 * here, and other locale files must provide exactly the same keys (enforced by the `Catalog`
 * type and a unit test). Strings use `{placeholders}` filled by `format()`.
 */
export const en = {
  // Shell
  "shell.skip": "Skip to content",
  "nav.home": "Home",
  "nav.communities": "Communities",
  "nav.create": "Create",
  "nav.chats": "Chats",
  "nav.profile": "Profile",
  "nav.search": "Search",

  // Landing (signed-out marketing page)
  "landing.badge": "The calm community app · 18+",
  "landing.hero.title": "Find your people. Build your community.",
  "landing.hero.body":
    "Kamino is communities, chats, watch parties and live rooms in one free app — with real tools for the people who run them. No ads in your face, no pay-to-win reputation.",
  "landing.cta.getStarted": "Get started",
  "landing.cta.tour": "Take the tour",
  "landing.cta.browse": "Browse communities",
  "landing.cta.explore": "Explore",
  "landing.features.title": "What you can do on Kamino",
  "landing.feature.communities.title": "Communities that feel small",
  "landing.feature.communities.body":
    "Micro-communities of 10–50 people, boards, wikis, quests and reputation that belongs to each community — not one global score.",
  "landing.feature.watch.title": "Watch parties with a queue",
  "landing.feature.watch.body":
    "Stream YouTube, Vimeo, Twitch or your own files in sync, vote on what plays next, run ready checks, and talk while you watch.",
  "landing.feature.live.title": "Live rooms and events",
  "landing.feature.live.body":
    "Stage rooms with hosts, speakers and hand-raising, scheduled events with reminders, and phone calls that just work.",
  "landing.feature.chats.title": "Chats worth opening",
  "landing.feature.chats.body":
    "Direct messages, group chats with moderators, voice notes, stickers, reactions and read receipts — on phone and web.",
  "landing.feature.creators.title": "Creators get real tools",
  "landing.feature.creators.body":
    "Portfolio, analytics, exclusive posts and subscriber spaces. Reputation and moderation can never be bought.",
  "landing.feature.safety.title": "Safety built in",
  "landing.feature.safety.body":
    "AI-assisted moderation with human review, appeals, timed mutes, adults-only 18+ birthday gate.",
  "landing.banner.title": "Your community is waiting",
  "landing.banner.body":
    "Pick your interests and Kamino suggests communities and people who share them — in under a minute, free, on iPhone, Android and the web.",
  "landing.banner.button": "Join Kamino free",
  "landing.footer.rights": "© {year} Kamino · Built by Kelnova Labs in Kelowna, Canada. The core app is free, forever.",
  "landing.footer.houseRules": "House rules",
  "landing.footer.privacy": "Privacy",
  "landing.footer.terms": "Terms",
  "landing.footer.copyright": "Copyright",
  "landing.footer.childSafety": "Child safety",
  "landing.footer.language": "Language",

  // Sign in / create account
  "login.lead.up": "Create Your ",
  "login.lead.in": "Welcome ",
  "login.highlight.up": "Account",
  "login.highlight.in": "Back",
  "login.text.up":
    "A calm place for your communities. Free to join, no pushy notifications.",
  "login.text.in": "Good to see you again. Sign in to get back to your people.",
  "login.tab.label": "Account access",
  "login.tab.up": "Create account",
  "login.tab.in": "Sign in",
  "login.invited": "You were invited by {name} — you both earn reputation when you join.",
  "login.field.displayName": "Display name",
  "login.field.displayNamePlaceholder": "What should we call you?",
  "login.field.email": "Email",
  "login.field.emailPlaceholder": "you@example.com",
  "login.field.password": "Password",
  "login.field.passwordPlaceholder": "At least 8 characters",
  "login.showPassword": "Show password",
  "login.hidePassword": "Hide password",
  "login.forgot": "Forgot your password?",
  "login.submit.busy": "Opening your world…",
  "login.submit.twoFactor": "Verify code",
  "login.submit.up": "Create My Account",
  "login.submit.in": "Sign In",
  "login.continueWith": "Continue with {provider}",
  "login.phone.title": "Sign in with a phone number",
  "login.phone.number": "Phone number",
  "login.phone.code": "SMS code",
  "login.phone.send": "Send SMS code",
  "login.phone.verify": "Verify SMS code",
  "login.agree": "By continuing you agree to the",
  "login.terms": "Terms",
  "login.and": "and",
  "login.privacy": "Privacy policy",
  "login.ageNote": "For adults aged 18 and older.",
  "login.switch.toIn": "I already have an account",
  "login.switch.toUp": "New here? Create an account",
  "login.looking": "Just looking around?",
  "login.explore": "Explore communities",
  "login.emailConfirm":
    "Check your email for the confirmation link, then sign in. You will confirm your birthday after verification.",

  // Home feed essentials
  "home.tab.forYou": "For You",
  "home.tab.following": "Following",
  "home.tab.communities": "Communities",
  "home.empty.forYou.title": "Your feed is quiet",
  "home.empty.forYou.body": "Join a few communities and their posts will show up here.",
  "home.empty.forYou.action": "Find communities",
  "home.empty.following.title": "No posts from people you follow",
  "home.empty.following.body": "Follow creators you like to see their posts here.",
  "home.empty.following.action": "Find people",
  "home.empty.communities.title": "Nothing new in your communities",
  "home.empty.communities.body": "Join communities to see their newest posts here.",
  "home.empty.communities.action": "Explore communities",

  // Privacy dashboard (where the language is chosen)
  "privacy.language.title": "Language",
  "privacy.language.help":
    "Your language preference helps discovery and translation tools. Interface translations depend on available translations.",
} as const;

export type CatalogKey = keyof typeof en;
export type Catalog = Record<CatalogKey, string>;
