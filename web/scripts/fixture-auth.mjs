/** Pace disposable loopback accounts through the real production auth limiter. */
export async function fixtureAuthFetch(url,options){
 if(!['localhost','127.0.0.1','::1'].includes(new URL(url).hostname))throw new Error('Disposable account fixtures require loopback.');
 for(let i=0;i<4;i++){
  const response=await fetch(url,options);
  if(response.status!==429||i===3)return response;
  const seconds=Number(response.headers.get('retry-after'));
  const delay=Math.min(30000,Math.max(11000,Number.isFinite(seconds)?seconds*1000:0));
  await new Promise(resolve=>setTimeout(resolve,delay));
 }
 throw new Error('Fixture account request unavailable.');
}
