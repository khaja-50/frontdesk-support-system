import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { listTickets, getTicket, customerExport, createTicket, assignTicket, addMessage, updateStatus, reopenTicket } from './db.js';

const root = dirname(fileURLToPath(import.meta.url));
const json = (res, status, value) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
async function body(req) { let s=''; for await (const chunk of req) s += chunk; return s ? JSON.parse(s) : {}; }
export function app(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const actor = req.headers['x-user-id'] || 'demo-agent';
  const role = req.headers['x-role'] || 'agent';
  if (url.pathname === '/health') return json(res,200,{status:'ok'});
  if (url.pathname === '/' || url.pathname === '/index.html') return readFile(join(root,'../public/index.html')).then(html=>{res.writeHead(200,{'content-type':'text/html'});res.end(html);});
  if (url.pathname === '/app.js') return readFile(join(root,'../public/app.js')).then(html=>{res.writeHead(200,{'content-type':'text/javascript'});res.end(html);});
  if (url.pathname === '/styles.css') return readFile(join(root,'../public/styles.css')).then(css=>{res.writeHead(200,{'content-type':'text/css'});res.end(css);});
  if (!url.pathname.startsWith('/api/')) return json(res,404,{error:'Not found'});
  try {
    if (req.method==='GET' && url.pathname==='/api/tickets') return json(res,200,listTickets());
    const m = url.pathname.match(/^\/api\/tickets\/(\d+)(?:\/(assign|messages|status|reopen|audit|export))?$/); if (!m) return json(res,404,{error:'Not found'});
    const id = Number(m[1]), action=m[2];
    if (req.method==='GET' && !action) return json(res,200,getTicket(id, role==='agent' || role==='admin'));
    if (req.method==='POST' && !action) return body(req).then(input=>json(res,201,createTicket(input,actor)));
    if (req.method==='POST' && action==='assign') return body(req).then(input=>{const result=assignTicket(id,input.assignee_id,actor); return result ? json(res,200,result) : json(res,409,{error:'Ticket has already been assigned'});});
    if (req.method==='POST' && action==='messages') return body(req).then(input=>{if(input.visibility==='internal' && role==='customer') return json(res,403,{error:'Internal notes are private'}); return json(res,201,addMessage(id,input,actor));});
    if (req.method==='POST' && action==='status') return body(req).then(input=>json(res,200,updateStatus(id,input.status,actor)));
    if (req.method==='POST' && action==='reopen') { const result=reopenTicket(id,actor); return result===false ? json(res,422,{error:'Reopen window has expired'}) : json(res,200,result); }
    if (req.method==='GET' && action==='audit') return json(res,200,getTicket(id,true)?.audit || []);
    if (req.method==='GET' && action==='export') return json(res,200,customerExport(id));
    return json(res,405,{error:'Method not allowed'});
  } catch (error) { console.error(error); return json(res,400,{error:error.message}); }
}

if (process.env.NODE_ENV !== 'test') createServer(app).listen(process.env.PORT || 3000, () => console.log(`Frontdesk running on http://localhost:${process.env.PORT || 3000}`));
