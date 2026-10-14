// Production start launches this alongside the web process. Multiple replicas are safe.
const secret=process.env.KAMINO_JOB_SECRET;
if(!secret) throw new Error('Set KAMINO_JOB_SECRET for background reminders and digests.');
const port=process.env.PORT||3000;
let running=false;
async function tick(){if(running)return;running=true;try{
  const response=await fetch(`http://127.0.0.1:${port}/api/v1/jobs`,{method:'POST',headers:{authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(55000)});
  if(!response.ok) console.error(`[notifications] scheduler returned ${response.status}`);
}catch(error){console.error('[notifications]',error.message);}finally{running=false;}}
const timer=setInterval(tick,60000);setTimeout(tick,10000);
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{clearInterval(timer);process.exit(0);});
