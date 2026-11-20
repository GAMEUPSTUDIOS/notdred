'use strict';
// v57 (real server): classic mode for Internet Explorer 5 (JScript 5.0-safe page), several frames in flight (each
// request gets its own newer frame), and Manage ship from classic (crew report, ranks, privacy, invite, rename).
const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),acorn=require('acorn');
const root=path.resolve(__dirname,'..');process.chdir(root);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),PORT=32000+Math.floor(Math.random()*900),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v57-'));
const srv=spawn(process.execPath,['server/server.cjs','--port',String(PORT)],{cwd:root,env:{...process.env,DATA_DIR:dataDir}});
const get=p=>new Promise((res,rej)=>http.get(`http://127.0.0.1:${PORT}${p}`,r=>{const b=[];r.on('data',d=>b.push(d));r.on('end',()=>res({status:r.statusCode,body:Buffer.concat(b),at:Date.now()}));}).on('error',rej));
const api=async p=>eval((await get(p)).body.toString());
const until=async(f,ms=5000,label='condition')=>{const t=Date.now();while(!(await f())){if(Date.now()-t>ms)throw Error('Timed out: '+label);await sleep(50);}};
(async()=>{let ok=false;try{
 // IE5-safe scripts: ES3 with no reserved words as property names, no ===, and the hand-made URL encoder matches.
 const page=fs.readFileSync('dist/classic.html','utf8'),js=page.split('<script type="text/javascript">')[1].split('</script>')[0];
 const index=fs.readFileSync('dist/index.html','utf8'),inline=index.slice(index.indexOf('<script>')+8,index.indexOf('</script>'));
 for(const [n,src] of [['classic page',js],['main page check',inline]]){acorn.parse(src,{ecmaVersion:3,allowReserved:false});assert.ok(!src.replace(/\/\*[\s\S]*?\*\//g,'').includes('==='),n+' avoids ===');}
 assert.ok(/Array\.prototype\.shift=function/.test(js)&&/function uenc\(t\)/.test(js)&&!/[^.]encodeURIComponent\(\w+\.value|\+encodeURIComponent\(/.test(js),'polyfills, and every URL goes through uenc');
 {const pick=n=>{const i=js.indexOf('function '+n+'(');let d=0,j=i;for(;j<js.length;j++){if(js[j]==='{')d++;if(js[j]==='}'&&--d===0)break;}return js.slice(i,j+1);};
  const {uenc,udec}=new Function('encodeURIComponent','decodeURIComponent','var HEX="0123456789ABCDEF";'+pick('hx')+pick('uenc')+pick('udec')+';return {uenc,udec};')(undefined,undefined);
  for(const t of ['Player One','Zoë & Co','船長','rocket 🚀','a+b=c/d?e'])assert.ok(uenc(t)===encodeURIComponent(t)&&udec(uenc(t))===t,'IE5 encoder: '+t);}
 assert.ok(/var DEPTH=\/MSIE \[1-7\]\\\.\/\.test\(navigator\.userAgent\)\?2:3/.test(js),'2 frames in flight in old IE, 3 elsewhere');
 await until(async()=>{try{return (await get('/health')).status===200;}catch{return false;}},8000,'server');
 const c=await api('/classic/connect?name=Cap');const S=c.session;await api('/classic/send?s='+S+'&m='+encodeURIComponent(JSON.stringify({type:'create',name:'Old Ship'})));
 await until(async()=>(await api('/classic/poll?s='+S)).status,6000,'joined');await get('/classic/frame?s='+S+'&w=480&h=300&z=20');
 // Three requests at once are answered one frame apart (each gets its own frame), not all with the same picture.
 for(let k=0;k<3;k++){const t0=Date.now(),r=await Promise.all([1,2,3].map(n=>get('/classic/frame?s='+S+'&w=480&h=300&z=20&n='+n)));assert.ok(r.every(x=>x.status===200));const spread=Math.max(...r.map(x=>x.at))-Math.min(...r.map(x=>x.at));if(k===2)assert.ok(spread>=40,'frames handed out one per new frame ('+spread+' ms apart)');await sleep(100);}
 // Manage ship: crew report, ship settings, privacy and invite, rename — all from classic.
 const B=await api('/classic/connect?name=Bob');const ship=(await api('/classic/poll?s='+S)).status;await api('/classic/send?s='+B.session+'&m='+encodeURIComponent(JSON.stringify({type:'list'})));
 let rooms=null;await until(async()=>{const p=await api('/classic/poll?s='+B.session);const m=(p.messages||[]).find(m=>m.type==='rooms');if(m)rooms=m.rooms;return rooms;},4000,'rooms');
 await api('/classic/send?s='+B.session+'&m='+encodeURIComponent(JSON.stringify({type:'join',room:rooms.find(r=>r.name==='Old Ship').id})));await until(async()=>(await api('/classic/poll?s='+B.session)).status,6000,'Bob aboard');
 const sendA=async m=>{const r=await api('/classic/send?s='+S+'&m='+encodeURIComponent(JSON.stringify(m)));assert.ok(!r.error,m.type+' allowed: '+r.error);};
 const waitFor=async type=>{let got=null;await until(async()=>{const p=await api('/classic/poll?s='+S);got=(p.messages||[]).find(m=>m.type===type)||got;return got;},4000,type);return got;};
 await sendA({type:'crew'});const rep=await waitFor('crew');const bob=rep.crew.find(r=>r.name==='Bob');assert.ok(rep.captain&&bob,'crew report');
 await sendA({type:'rank',account:bob.short,rank:'crew'});await until(async()=>(await api('/classic/poll?s='+B.session)).status?.rank==='crew',4000,'Bob promoted from classic');
 await sendA({type:'privacy',private:true});await sendA({type:'shipsettings'});const set=await waitFor('shipsettings');assert.equal(set.private,true);assert.ok(/^[a-f0-9]+$/.test(set.invite),'invite link');
 await api('/classic/rename?s='+S+'&name='+encodeURIComponent('Renamed Old Ship'));await until(async()=>(await api('/classic/poll?s='+S)).status?.ship==='Renamed Old Ship',4000,'renamed from classic');
 assert.ok((await api('/classic/send?s='+S+'&m='+encodeURIComponent(JSON.stringify({type:'hello'})))).error,'other messages still refused');
 ok=true;console.log('PASS: classic mode — IE5-safe page (ES3, no ===, own URL encoder), several frames in flight, Manage ship (crew, ranks, privacy, invite, rename).');
}catch(e){console.error(e);}finally{srv.kill();await sleep(400);fs.rmSync(dataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});process.exit(ok?0:1);}})();
