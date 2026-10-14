/**
 * The server writes notification links in website form ("/c/starlight/p/12").
 * This turns them into screens of the phone app. Unknown links open the notification list.
 */
export function appHrefFromServerHref(href: string): string {
  if(href==='/') return '/';
  if(href==='/admin/operations') return '/admin-operations';
  if(['/connections','/media-library','/short-videos','/smart-search','/operations','/admin-analytics'].includes(href)) return href;
  if(href.startsWith('/appeal#proof=')) return '/appeal?proof='+encodeURIComponent(href.slice('/appeal#proof='.length));
  const group = /^\/groups\/(\d+)$/.exec(href);
  if(group) return `/groups/${group[1]}`;
  if(href==='/support') return '/tools?tab=support';
  if(href==='/creator') return '/tools?tab=creator';
  if(href==='/discover-plus') return '/tools?tab=discovery';
  if(href==='/safety' || href==='/admin/safety' || href==='/admin/reports') return '/safety';
  const invite = /^\/invite\/([a-z0-9-]+)(?:[?#]|$)/i.exec(href);
  if(invite) return `/invite/${invite[1]}`;
  const tool = /^\/c\/([^/]+)\/(events|tools)$/.exec(href);
  if(tool) return `/community/${tool[1]}/${tool[2]}`;
  const post = /^\/c\/([^/]+)\/p\/(\d+)$/.exec(href);
  if (post) return `/community/${post[1]}/post/${post[2]}`;
  const story = /^\/c\/([^/]+)\/roleplay\/(\d+)$/.exec(href);
  if (story) return `/community/${story[1]}/roleplay/${story[2]}`;
  const mod = /^\/c\/([^/]+)\/mod$/.exec(href);
  if (mod) return `/community/${mod[1]}/mod`;
  const community = /^\/c\/([^/?#]+)/.exec(href);
  if (community) return `/community/${community[1]}`;
  const call = /^\/chats\/(\d+)\?call=1$/.exec(href);
  if (call) return `/call/${call[1]}`;
  const chat = /^\/chats\/(\d+)$/.exec(href);
  if (chat) return `/chat/${chat[1]}`;
  const profile = /^\/u\/([^/?#]+)/.exec(href);
  if (profile) return `/profile/${profile[1]}`;
  return "/notifications";
}
