/** Loopback-only test provider. Never used in a release configuration or as an AI fallback. */
import {createServer} from 'node:http';
const words=['manga','code','garden'];
createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/v1/embeddings'){res.writeHead(404).end();return;}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>500000){res.writeHead(413).end();return;}}
 try{const body=JSON.parse(raw);if(body.model!=='fixture-v10'||!Array.isArray(body.input))throw Error('Invalid fixture');
  const data=body.input.map((text,index)=>{const normalized=String(text).toLowerCase();const embedding=words.map(w=>normalized.includes(w)?1:0);if(!embedding.some(Boolean))embedding[2]=1;return {index,embedding};});
  res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({data}));
 }catch{res.writeHead(400).end();}
}).listen(8091,'127.0.0.1',()=>console.log('Loopback embedding fixture ready. No external provider calls.'));
