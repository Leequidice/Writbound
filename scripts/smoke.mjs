import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const api = spawn(process.execPath, ['services/api/dist/server.js'], {env:{...process.env,PORT:'3011'},stdio:'pipe'});
const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js','apps/web','--host','127.0.0.1','--port','5181','--strictPort'], {stdio:'pipe'});
try {
  for (const url of ['http://127.0.0.1:3011/health','http://127.0.0.1:5181/']) {
    let response;
    for (let i=0;i<40;i++) { try { response = await fetch(url, {signal:AbortSignal.timeout(1000)}); break; } catch { await new Promise(r=>setTimeout(r,250)); } }
    if (!response?.ok) throw new Error(`Unavailable: ${url}`);
    console.log(url,response.status, (await response.text()).slice(0,140));
  }
  const db = new DatabaseSync('data/writbound.sqlite');
  console.log('Persistent tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all());
  db.close();
} finally {api.kill();web.kill();}
