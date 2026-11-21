import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ready, listTickets, getTicket, customerExport, createTicket, assignTicket, addMessage, updateStatus, reopenTicket } from './db.js';
import { authReady, login, logout, registerUser, userFromToken } from './auth.js';

const root = dirname(fileURLToPath(import.meta.url));
const json = (res, status, value) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
async function body(req) { let s=''; for await (const chunk of req) s += chunk; return s ? JSON.parse(s) : {}; }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(value => { const [key, ...parts] = value.trim().split('='); return [key, decodeURIComponent(parts.join('='))]; })); }
async function currentUser(req) { return userFromToken(cookies(req).frontdesk_session); }
function deny(res, status, message) { return json(res, status, { error: message }); }
function needsUser(res, user) { return user || (deny(res, 401, 'Login required'), null); }
function needsRole(res, user, roles) { return user && roles.includes(user.role) ? user : (deny(res, user ? 403 : 401, user ? 'This role cannot perform that action' : 'Login required'), null); }
function sessionCookie(token, maxAge = 7 * 86400) { return `frontdesk_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
export async function app(req, res) {
  await Promise.all([ready, authReady]);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') return json(res,200,{status:'ok'});
  if (url.pathname === '/' || url.pathname === '/index.html') return readFile(join(root,'../public/index.html')).then(html=>{res.writeHead(200,{'content-type':'text/html'});res.end(html);});
  if (url.pathname === '/app.js') return readFile(join(root,'../public/app.js')).then(html=>{res.writeHead(200,{'content-type':'text/javascript'});res.end(html);});
  if (url.pathname === '/styles.css') return readFile(join(root,'../public/styles.css')).then(css=>{res.writeHead(200,{'content-type':'text/css'});res.end(css);});
  if (!url.pathname.startsWith('/api/')) return json(res,404,{error:'Not found'});
  try {
    if (req.method==='POST' && url.pathname==='/api/auth/login') { const input = await body(req); const session = await login(input.email || '', input.password || ''); return session ? (res.setHeader('set-cookie', sessionCookie(session.token)), json(res,200,session.user)) : deny(res,401,'Email or password is incorrect'); }
    if (req.method==='POST' && url.pathname==='/api/auth/logout') { await logout(cookies(req).frontdesk_session); res.setHeader('set-cookie', sessionCookie('', 0)); return json(res,200,{ok:true}); }
    if (req.method==='GET' && url.pathname==='/api/auth/me') { const user = await currentUser(req); return user ? json(res,200,user) : deny(res,401,'Login required'); }
    if (req.method==='POST' && url.pathname==='/api/users') { const user = needsRole(res, await currentUser(req), ['admin']); if (!user) return; return json(res,201,await registerUser(await body(req))); }
    const user = needsUser(res, await currentUser(req)); if (!user) return;
    if (req.method==='GET' && url.pathname==='/api/tickets') return json(res,200,await listTickets(user.role === 'customer' ? user.email : null));
    if (req.method==='POST' && url.pathname==='/api/tickets') return json(res,201,await createTicket(await body(req),user.id));
    const m = url.pathname.match(/^\/api\/tickets\/(\d+)(?:\/(assign|messages|status|reopen|audit|export))?$/); if (!m) return json(res,404,{error:'Not found'});
    const id = Number(m[1]), action=m[2];
    const ticket = await getTicket(id, user.role !== 'customer');
    if (!ticket || (user.role === 'customer' && ticket.customer_email.toLowerCase() !== user.email.toLowerCase())) return deny(res,404,'Ticket not found');
    if (req.method==='GET' && !action) return json(res,200,ticket);
    if (req.method==='POST' && action==='assign') { if (!needsRole(res,user,['agent','admin'])) return; const input = await body(req); const result=await assignTicket(id,input.assignee_id,user.id); return result ? json(res,200,result) : json(res,409,{error:'Ticket has already been assigned'}); }
    if (req.method==='POST' && action==='messages') { const input = await body(req); if(input.visibility==='internal' && !['agent','admin'].includes(user.role)) return deny(res,403,'Internal notes are private'); return json(res,201,await addMessage(id,input,user.id)); }
    if (req.method==='POST' && action==='status') { if (!needsRole(res,user,['agent','admin'])) return; return json(res,200,await updateStatus(id,(await body(req)).status,user.id)); }
    if (req.method==='POST' && action==='reopen') { const result=await reopenTicket(id,user.id); return result===false ? json(res,422,{error:'Reopen window has expired'}) : json(res,200,result); }
    if (req.method==='GET' && action==='audit') { if (!needsRole(res,user,['agent','admin'])) return; return json(res,200,ticket.audit || []); }
    if (req.method==='GET' && action==='export') return json(res,200,await customerExport(id));
    return json(res,405,{error:'Method not allowed'});
  } catch (error) { console.error(error); return json(res,400,{error:error.message}); }
}

if (process.env.NODE_ENV !== 'test') createServer(app).listen(process.env.PORT || 3000, () => console.log(`Frontdesk running on http://localhost:${process.env.PORT || 3000}`));
