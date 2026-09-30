import { it, expect } from 'vitest';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiagnostics, validateClientEvent } from './diagnostics.mjs';
import { createRunner } from './server.mjs';
import { analyzePage } from './analysis.mjs';
const id = '12345678-1234-1234-1234-123456789abc';
const input = { model: 'test', facts: 'PRIVATE_FACT', image: 'data:image/png;base64,AA==', width: 10, height: 10 };
it('bounds owner-only JSONL, strips sensitive arbitrary metadata and rejects unknown events', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ai-diagnostics-')); const path = join(dir, 'events.jsonl');
  try {
    const log = createDiagnostics(path, 400);
    for (let n = 0; n < 12; n++) await log(id, 'error', {code:'local_failure', elapsedMs:n, facts:'PRIVATE_FACT', error:'TOKEN', fields:999});
    await log(id, 'PRIVATE_FACT'); await log('not-uuid', 'error');
    const contents = await readFile(path, 'utf8') + await readFile(path + '.1', 'utf8');
    expect(contents).not.toMatch(/PRIVATE_FACT|TOKEN|fields/);
    expect((await stat(path)).size).toBeLessThanOrEqual(400);
    expect((await stat(path + '.1')).size).toBeLessThanOrEqual(400);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(validateClientEvent({requestId:id,stage:'review_ready',fields:0})).toBeTruthy();
    for (const event of [{requestId:id,stage:'unknown'}, {requestId:id,stage:'error',facts:'secret'}, {requestId:id,stage:'applied',fields:201}, {requestId:'-'.repeat(36),stage:'error'}]) expect(validateClientEvent(event)).toBeNull();
  } finally { await rm(dir, {recursive:true,force:true}); }
});
it('records mocked provider milestones without model input or raw output', async () => {
  const events=[];
  const data = 'data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text:'{"fields":[],"questions":[]}'}]}]}})+'\n\n';
  await analyzePage(input, {token:'FAKE_SECRET', trace:(stage,details)=>events.push({stage,...details}), fetchImpl:async()=>new Response(data)});
  expect(events.map(x=>x.stage)).toEqual(['upstream_headers','first_event','completed','schema_valid']);
  expect(JSON.stringify(events)).not.toMatch(/PRIVATE_FACT|FAKE_SECRET|test/);
});
it('collects bounded same-origin client events and request correlation; logs disconnected mock analysis', async () => {
  const events=[]; const port=21456; const base=`http://127.0.0.1:${port}`;
  let accepted; const pending = new Promise(resolve=>{accepted=resolve;});
  const server=createRunner({dist:tmpdir(),port,diagnostics:(requestId,stage,details)=>events.push({requestId,stage,...details}),oauth:{token:()=> 'FAKE',models:async()=>[{slug:'test'}]},analyze:async(_input,{signal})=>{accepted(); return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('PRIVATE_ERROR'))));}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const post=body=>fetch(base+'/api/ai/diagnostics',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body});
  try {
    expect((await post(JSON.stringify({requestId:id,stage:'review_ready',fields:0}))).status).toBe(200);
    expect((await post(JSON.stringify({requestId:id,stage:'error',facts:'PRIVATE_FACT'}))).status).toBe(400);
    expect((await post('x'.repeat(513))).status).toBe(413);
    expect((await fetch(base+'/api/ai/diagnostics',{method:'POST',headers:{Origin:'https://invalid.test','Content-Type':'application/json'},body:'{}'})).status).toBe(403);
    const controller=new AbortController();
    const request=fetch(base+'/api/ai/analyze',{method:'POST',signal:controller.signal,headers:{Origin:base,'Content-Type':'application/json','X-AI-Request-ID':id},body:JSON.stringify(input)}).catch(()=>{});
    await pending; controller.abort(); await request;
    await new Promise(resolve=>setTimeout(resolve,40));
    expect(events.filter(x=>x.stage==='cancel')).toHaveLength(1);
    expect(events.every(x=>x.requestId===id)).toBe(true);
    expect(events[0]).toMatchObject({source:'client',stage:'review_ready',fields:0});
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE_|FAKE/);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
