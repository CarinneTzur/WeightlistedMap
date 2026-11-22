// Failure notifications follow the repository owner's GitHub Actions settings.
const origin = 'https://stillwater-compass.vercel.app';
for (let attempt=1; attempt<=3; attempt++) {
 try {
  const response=await fetch(origin,{signal:AbortSignal.timeout(20000),redirect:'follow'});
  const html=await response.text();
  if(!response.ok || new URL(response.url).hostname!==new URL(origin).hostname || !html.includes('id="root"'))throw Error(`Unexpected app response: ${response.status}`);
  const asset=html.match(/src="([^"]+\.js)"/);
  if(!asset)throw Error('App script missing');
  const script=await fetch(new URL(asset[1],origin),{signal:AbortSignal.timeout(20000)});
  if(!script.ok || !/javascript/.test(script.headers.get('content-type')||''))throw Error('App script unavailable');
  console.log('Production app shell and JavaScript are available.');
  process.exit(0);
 } catch(error) {
  console.error(`Attempt ${attempt}: ${error.message}`);
  if(attempt<3) await new Promise(resolve=>setTimeout(resolve,5000));
 }
}
process.exit(1);
