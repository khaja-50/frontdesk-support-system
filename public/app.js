const $ = (selector) => document.querySelector(selector);
const fmt = (date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
let allTickets = [];
let currentView = 'all';
let currentUser = null;
let currentTicketId = null;

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed');
  return data;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function render(tickets) {
  const counts = { open: allTickets.filter((ticket) => ticket.status === 'open').length, active: allTickets.filter((ticket) => ticket.status === 'in_progress').length, urgent: allTickets.filter((ticket) => ticket.priority === 'urgent').length };
  $('#stats').innerHTML = `<div class="stat"><small>Open queue</small><strong>${counts.open}</strong><span>Needs a first response</span></div><div class="stat"><small>In progress</small><strong>${counts.active}</strong><span>Being handled now</span></div><div class="stat"><small>Urgent</small><strong>${counts.urgent}</strong><span>Highest priority</span></div><div class="stat"><small>SLA policy</small><strong>09:30—18:30</strong><span>Working hours</span></div>`;
  $('#result-count').textContent = `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`;
  const empty = currentView === 'waiting' ? 'No tickets are waiting for a customer reply.' : currentView === 'closed' ? 'No closed tickets yet.' : 'No open tickets. Create a new ticket to start the queue.';
  $('#tickets').innerHTML = tickets.length ? tickets.map((ticket) => `<article class="card" data-ticket-id="${ticket.id}" tabindex="0" role="button"><div class="card-top"><span class="ticket-id">#${ticket.id}</span><span class="badge ${ticket.priority}">${ticket.priority}</span><span class="badge ${ticket.status}">${ticket.status.replace('_', ' ')}</span></div><h3>${escapeHtml(ticket.subject)}</h3><p class="description">${escapeHtml(ticket.description)}</p><div class="meta"><span>${escapeHtml(ticket.customer_email)}</span><span>${ticket.assignee_id ? `Assigned to ${escapeHtml(ticket.assignee_id)}` : 'Unassigned'}</span></div><div class="sla">SLA due <strong>${fmt(ticket.sla_due_at)}</strong></div></article>`).join('') : `<div class="empty">${empty}</div>`;
}

function filterTickets() {
  const term = $('#search').value.trim().toLowerCase();
  const viewTickets = currentView === 'waiting' ? allTickets.filter((ticket) => ticket.status === 'waiting_customer') : currentView === 'closed' ? allTickets.filter((ticket) => ticket.status === 'closed') : allTickets.filter((ticket) => ticket.status !== 'closed');
  render(viewTickets.filter((ticket) => `${ticket.subject} ${ticket.customer_email} ${ticket.description}`.toLowerCase().includes(term)));
}

async function refresh() {
  try { allTickets = await api('/api/tickets'); filterTickets(); }
  catch (error) { $('#tickets').innerHTML = `<div class="empty">Could not load the queue: ${escapeHtml(error.message)}</div>`; }
}

function showMessages(messages) {
  $('#detail-messages').innerHTML = messages.length ? messages.map((message) => `<div class="message ${message.visibility}"><strong>${message.visibility === 'internal' ? 'Internal note' : 'Reply'}</strong><span>${fmt(message.created_at)}</span><p>${escapeHtml(message.body)}</p></div>`).join('') : '<p class="empty">No replies or notes yet.</p>';
}

async function openTicket(id) {
  try {
    const ticket = await api(`/api/tickets/${id}`);
    currentTicketId = id;
    $('#detail-subject').textContent = ticket.subject;
    $('#detail-meta').textContent = `#${ticket.id} · ${ticket.customer_email} · ${ticket.priority} · ${ticket.status.replace('_', ' ')}`;
    $('#detail-status').value = ticket.status;
    $('#detail-assignee').value = ticket.assignee_id || '';
    showMessages(ticket.messages || []);
    $('#detail-actions').hidden = currentUser.role === 'customer';
    $('#detail-audit').innerHTML = currentUser.role === 'customer' ? '' : `<h3>History</h3>${(ticket.audit || []).map((event) => `<p><strong>${escapeHtml(event.action)}</strong> by ${escapeHtml(event.actor_id)} · ${fmt(event.created_at)}</p>`).join('')}`;
    $('#ticket-detail-dialog').showModal();
  } catch (error) { alert(error.message); }
}

function showDashboard(user) { currentUser = user; $('#login-panel').classList.add('hidden'); $('#app-shell').classList.remove('hidden'); $('#current-user').textContent = `${user.display_name} · ${user.role}`; refresh(); }

$('#login-form').onsubmit = async (event) => { event.preventDefault(); $('#login-error').textContent = ''; try { showDashboard(await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) })); } catch (error) { $('#login-error').textContent = error.message; } };
$('#register-form').onsubmit = async (event) => { event.preventDefault(); $('#register-error').textContent = ''; try { showDashboard(await api('/api/auth/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) })); } catch (error) { $('#register-error').textContent = error.message; } };
$('#show-register').onclick = () => { $('#login-form').classList.add('hidden'); $('#register-form').classList.remove('hidden'); };
$('#show-login').onclick = () => { $('#register-form').classList.add('hidden'); $('#login-form').classList.remove('hidden'); };
$('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); };
$('#new-ticket').onclick = () => $('#ticket-dialog').showModal();
$('#search').oninput = filterTickets;
$('#tickets').onclick = (event) => { const card = event.target.closest('[data-ticket-id]'); if (card) openTicket(card.dataset.ticketId); };
$('#tickets').onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { const card = event.target.closest('[data-ticket-id]'); if (card) openTicket(card.dataset.ticketId); } };
document.querySelectorAll('[data-view]').forEach((link) => link.onclick = (event) => { event.preventDefault(); currentView = link.dataset.view; document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === link)); const title = currentView === 'waiting' ? 'Waiting on customer' : currentView === 'closed' ? 'Closed tickets' : 'Ticket queue'; $('#page-title').textContent = title; $('#queue-heading').textContent = title; filterTickets(); });
$('#ticket-form').onsubmit = async (event) => { event.preventDefault(); try { await api('/api/tickets', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); event.target.closest('dialog').close(); event.target.reset(); await refresh(); } catch (error) { alert(error.message); } };
$('#detail-send').onclick = async () => { const body = $('#detail-body').value.trim(); if (!body) return; try { const ticket = await api(`/api/tickets/${currentTicketId}/messages`, { method: 'POST', body: JSON.stringify({ body, visibility: $('#detail-visibility').value }) }); showMessages(ticket.messages || []); $('#detail-body').value = ''; await refresh(); } catch (error) { alert(error.message); } };
$('#detail-status-save').onclick = async () => { try { await api(`/api/tickets/${currentTicketId}/status`, { method: 'POST', body: JSON.stringify({ status: $('#detail-status').value }) }); await refresh(); await openTicket(currentTicketId); } catch (error) { alert(error.message); } };
$('#detail-assign').onclick = async () => { const assigneeId = $('#detail-assignee').value.trim(); if (!assigneeId) return; try { await api(`/api/tickets/${currentTicketId}/assign`, { method: 'POST', body: JSON.stringify({ assignee_id: assigneeId }) }); await refresh(); await openTicket(currentTicketId); } catch (error) { alert(error.message); } };
api('/api/auth/me').then(showDashboard).catch(() => $('#login-panel').classList.remove('hidden'));
