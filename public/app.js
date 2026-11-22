import { defaultFilters, selectTickets, ticketCounts, statusLabels, priorityLabels } from './queue.js';

const $ = (selector) => document.querySelector(selector);
const fmt = (date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const shortDate = (date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(date));
const icon = (name, extra = '') => `<svg class="icon ${extra}" aria-hidden="true"><use href="#icon-${name}"/></svg>`;
let allTickets = [];
let filters = { ...defaultFilters };
let currentUser = null;
let currentTicketId = null;
let toastTimer;
let openingTicket = false;

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed. Please try again.');
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function showToast(message, kind = '') {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').className = `toast show ${kind}`;
  toastTimer = window.setTimeout(() => $('#toast').classList.remove('show'), 3000);
}

function setLoading(button, loading) {
  button.classList.toggle('is-loading', loading);
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
}

async function runAction(button, errorSelector, action) {
  $(errorSelector).textContent = '';
  setLoading(button, true);
  try { await action(); }
  catch (error) { $(errorSelector).textContent = error.message; }
  finally { setLoading(button, false); }
}

function renderMetrics() {
  const counts = ticketCounts(allTickets);
  const metrics = [
    { id: 'open', label: 'Open queue', count: counts.open, caption: 'Needs a first response', icon: 'inbox', selected: filters.status === 'open' },
    { id: 'active', label: 'In progress', count: counts.active, caption: 'Being handled now', icon: 'loader-circle', selected: filters.status === 'in_progress' },
    { id: 'urgent', label: 'Urgent', count: counts.urgent, caption: 'Highest priority', icon: 'circle-alert', selected: filters.priority === 'urgent' },
  ];
  $('#stats').innerHTML = metrics.map((metric) => `<button type="button" class="stat" data-metric="${metric.id}" aria-pressed="${metric.selected}" aria-label="Filter ${metric.label}: ${metric.count} tickets"><small>${icon(metric.icon)}${metric.label}</small><strong>${metric.count}</strong><span>${metric.caption}</span></button>`).join('');
}

function renderCard(ticket) {
  const priority = priorityLabels[ticket.priority] || ticket.priority;
  const status = statusLabels[ticket.status] || ticket.status;
  const validDate = ticket.updated_at && Number.isFinite(Date.parse(ticket.updated_at));
  const assignee = ticket.assignee_id ? `Agent ${ticket.assignee_id}` : 'Unassigned';
  return `<article class="card" data-ticket-id="${escapeHtml(ticket.id)}" tabindex="0" role="button" aria-label="Open ticket SA-${escapeHtml(ticket.id)}: ${escapeHtml(ticket.subject)}">
    <div class="card-top"><span class="ticket-id">SA-${escapeHtml(ticket.id)}</span><div class="card-badges"><span class="badge ${escapeHtml(ticket.priority)}">${ticket.priority === 'urgent' ? '<i class="urgency-dot" aria-hidden="true"></i>' : ''}${escapeHtml(priority)}</span><span class="badge ${escapeHtml(ticket.status)}">${escapeHtml(status)}</span></div></div>
    <h3>${escapeHtml(ticket.subject)}</h3>
    ${ticket.description ? `<p class="description">${escapeHtml(ticket.description)}</p>` : ''}
    <div class="card-summary"><span class="customer" title="${escapeHtml(ticket.customer_email)}">${escapeHtml(ticket.customer_email)}</span><div class="card-footer"><span class="assignee" title="${escapeHtml(assignee)}">${icon('user-round')}<span>${escapeHtml(assignee)}</span></span>${validDate ? `<time datetime="${escapeHtml(ticket.updated_at)}" title="Updated ${escapeHtml(fmt(ticket.updated_at))}" aria-label="Updated ${escapeHtml(fmt(ticket.updated_at))}">${escapeHtml(shortDate(ticket.updated_at))}</time>` : ''}</div></div>
  </article>`;
}

function hasFilters() { return Object.keys(defaultFilters).some((key) => filters[key] !== defaultFilters[key]); }

function renderTickets() {
  const tickets = selectTickets(allTickets, filters);
  $('#result-count').textContent = `${tickets.length} of ${allTickets.length} tickets`;
  $('#clear-filters').disabled = !hasFilters();
  if (tickets.length) { $('#tickets').innerHTML = tickets.map(renderCard).join(''); return; }
  const filtered = hasFilters();
  $('#tickets').innerHTML = `<div class="empty">${icon(filtered ? 'search' : 'inbox')}<strong>${filtered ? 'No matching tickets' : 'Your queue is clear'}</strong><p>${filtered ? 'Try another search or clear your filters to see active tickets.' : 'New customer requests will appear here.'}</p><button class="secondary" type="button" id="empty-action">${filtered ? 'Clear filters' : 'Create a ticket'}</button></div>`;
  $('#empty-action').onclick = filtered ? resetFilters : () => $('#new-ticket').click();
}

function syncNavigation() {
  const view = filters.status === 'waiting_customer' ? 'waiting' : filters.status === 'closed' ? 'closed' : 'all';
  document.querySelectorAll('[data-view]').forEach((link) => {
    const selected = link.dataset.view === view;
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $('#page-title').textContent = view === 'waiting' ? 'Waiting on customer' : view === 'closed' ? 'Closed tickets' : 'Ticket queue';
  $('#queue-heading').textContent = view === 'waiting' ? 'Waiting on customer' : view === 'closed' ? 'Closed tickets' : 'All tickets';
}

function applyFilters() {
  $('#search').value = filters.search;
  for (const key of ['status', 'priority', 'assignee', 'sort']) $(`#filter-${key}`).value = filters[key];
  syncNavigation();
  renderMetrics();
  renderTickets();
}
function resetFilters() { filters = { ...defaultFilters }; applyFilters(); }

function updateAssignees() {
  const agents = [...new Set(allTickets.map((ticket) => ticket.assignee_id).filter(Boolean).map(String))].sort();
  $('#filter-assignee').innerHTML = '<option value="all">All assignees</option><option value="unassigned">Unassigned</option>' + agents.map((id) => `<option value="${escapeHtml(id)}">Agent ${escapeHtml(id)}</option>`).join('');
  if (!['all', 'unassigned', ...agents].includes(filters.assignee)) filters.assignee = 'all';
}

async function refresh() {
  $('#tickets').setAttribute('aria-busy', 'true');
  try { allTickets = await api('/api/tickets'); updateAssignees(); applyFilters(); }
  catch (error) {
    $('#result-count').textContent = 'Unavailable';
    $('#tickets').innerHTML = `<div class="empty">${icon('circle-alert')}<strong>Could not load tickets</strong><p>${escapeHtml(error.message)}</p><button class="secondary" id="retry-queue" type="button">Try again</button></div>`;
    $('#retry-queue').onclick = refresh;
  } finally { $('#tickets').setAttribute('aria-busy', 'false'); }
}

function showMessages(messages) {
  $('#detail-messages').innerHTML = messages.length ? messages.map((message) => `<div class="message ${escapeHtml(message.visibility)}"><strong>${message.visibility === 'internal' ? 'Internal note' : 'Reply'}</strong><time datetime="${escapeHtml(message.created_at)}">${fmt(message.created_at)}</time><p>${escapeHtml(message.body)}</p></div>`).join('') : '<p class="empty">No replies or notes yet.</p>';
}

function showAudit(audit) {
  if (!audit.length) return '<section class="audit"><h3>History</h3><p>No history yet.</p></section>';
  const labels = { 'ticket.created': 'Ticket created', 'ticket.assigned': 'Agent assigned', 'reply.sent': 'Reply sent', 'note.added': 'Internal note added', 'ticket.status_changed': 'Status changed', 'ticket.reopened': 'Ticket reopened' };
  return `<section class="audit"><h3>History</h3><div class="timeline">${audit.map((event) => `<div class="timeline-item"><span class="timeline-dot" aria-hidden="true"></span><div><strong>${escapeHtml(labels[event.action] || event.action.replaceAll('_', ' ').replaceAll('.', ' · '))}</strong><p>${escapeHtml(event.actor_id)} · <time datetime="${escapeHtml(event.created_at)}">${fmt(event.created_at)}</time></p></div></div>`).join('')}</div></section>`;
}

async function openTicket(id) {
  if (openingTicket) return;
  openingTicket = true;
  const dialog = $('#ticket-detail-dialog');
  const sameTicket = String(currentTicketId) === String(id);
  currentTicketId = id;
  $('#detail-error').textContent = '';
  if (!dialog.open) {
    $('#detail-subject').textContent = 'Loading ticket…';
    $('#detail-meta').textContent = '';
    $('#detail-description').textContent = '';
    $('#detail-messages').innerHTML = `<div class="empty">${icon('loader-circle', 'loading-icon')}Loading conversation…</div>`;
    $('#detail-actions').hidden = true;
    $('#detail-audit').innerHTML = '';
    dialog.showModal();
  }
  if (!sameTicket) $('#detail-body').value = '';
  try {
    const ticket = await api(`/api/tickets/${id}`);
    $('#detail-subject').textContent = ticket.subject;
    $('#detail-meta').textContent = `SA-${ticket.id} · ${ticket.customer_email} · ${(priorityLabels[ticket.priority] || ticket.priority).toUpperCase()} · ${(statusLabels[ticket.status] || ticket.status).toUpperCase()}`;
    $('#detail-description').textContent = ticket.description || '';
    $('#detail-status').value = ticket.status;
    $('#detail-assignee').value = ticket.assignee_id || '';
    showMessages(ticket.messages || []);
    $('#detail-actions').hidden = currentUser.role === 'customer';
    $('#detail-archive').hidden = currentUser.role !== 'admin';
    $('#detail-audit').innerHTML = currentUser.role === 'customer' ? '' : showAudit(ticket.audit || []);
  } catch (error) { $('#detail-subject').textContent = 'Ticket unavailable'; $('#detail-error').textContent = error.message; }
  finally { openingTicket = false; }
}

function showDashboard(user) {
  currentUser = user;
  $('#login-panel').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  $('#tickets').innerHTML = `<div class="empty">${icon('loader-circle', 'loading-icon')}Loading tickets…</div>`;
  refresh();
}

$('#login-form').onsubmit = async (event) => {
  event.preventDefault();
  await runAction(event.target.querySelector('[type="submit"]'), '#login-error', async () => {
    showDashboard(await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }));
    showToast('Signed in successfully');
    $('#main-content').focus();
  });
};
$('#register-form').onsubmit = async (event) => {
  event.preventDefault();
  await runAction(event.target.querySelector('[type="submit"]'), '#register-error', async () => {
    showDashboard(await api('/api/auth/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }));
    showToast('Your account is ready');
    $('#main-content').focus();
  });
};
$('#show-register').onclick = () => { $('#login-form').classList.add('hidden'); $('#register-form').classList.remove('hidden'); $('#register-form input').focus(); };
$('#show-login').onclick = () => { $('#register-form').classList.add('hidden'); $('#login-form').classList.remove('hidden'); $('#login-form input').focus(); };
$('#logout').onclick = async (event) => {
  const button = event.currentTarget;
  setLoading(button, true);
  try {
    await api('/api/auth/logout', { method: 'POST' });
    setNavOpen(false);
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    currentUser = null; allTickets = []; currentTicketId = null; filters = { ...defaultFilters };
    $('#app-shell').classList.add('hidden'); $('#login-panel').classList.remove('hidden');
    $('#login-form').reset(); $('#login-form').classList.remove('hidden'); $('#register-form').classList.add('hidden');
    $('#login-error').textContent = ''; $('#login-form input').focus(); showToast('Signed out successfully');
  } catch (error) { showToast(error.message); }
  finally { setLoading(button, false); }
};
$('#new-ticket').onclick = () => { $('#ticket-error').textContent = ''; if (currentUser.role === 'customer') $('#ticket-form [name="customer_email"]').value = currentUser.email; $('#ticket-dialog').showModal(); };
$('#search').oninput = (event) => { filters.search = event.target.value; renderTickets(); };
for (const key of ['status', 'priority', 'assignee', 'sort']) $(`#filter-${key}`).onchange = (event) => { filters[key] = event.target.value; applyFilters(); };
$('#clear-filters').onclick = resetFilters;
$('#stats').onclick = (event) => {
  const button = event.target.closest('[data-metric]');
  if (!button) return;
  const metric = button.dataset.metric;
  filters = { ...defaultFilters, status: metric === 'urgent' ? 'all' : metric === 'active' ? 'in_progress' : 'open', priority: metric === 'urgent' ? 'urgent' : 'all' };
  applyFilters();
  $(`[data-metric="${metric}"]`).focus();
};
$('#tickets').onclick = (event) => { const card = event.target.closest('[data-ticket-id]'); if (card) openTicket(card.dataset.ticketId); };
$('#tickets').onkeydown = (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('[data-ticket-id]');
  if (card) { event.preventDefault(); openTicket(card.dataset.ticketId); }
};
document.querySelectorAll('[data-view]').forEach((link) => link.onclick = (event) => {
  event.preventDefault();
  filters = { ...defaultFilters, status: link.dataset.view === 'waiting' ? 'waiting_customer' : link.dataset.view === 'closed' ? 'closed' : 'active' };
  applyFilters(); setNavOpen(false);
});
$('#ticket-form').onsubmit = async (event) => {
  event.preventDefault();
  await runAction(event.target.querySelector('[type="submit"]'), '#ticket-error', async () => {
    const ticket = await api('/api/tickets', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    $('#ticket-dialog').close(); event.target.reset(); filters = { ...defaultFilters }; await refresh(); showToast(`Ticket SA-${ticket.id} created`, 'ticket');
  });
};
$('#detail-send').onclick = (event) => runAction(event.currentTarget, '#detail-error', async () => {
  const body = $('#detail-body').value.trim();
  if (!body) throw Error('Write a reply or note before adding an update.');
  await api(`/api/tickets/${currentTicketId}/messages`, { method: 'POST', body: JSON.stringify({ body, visibility: $('#detail-visibility').value }) });
  $('#detail-body').value = ''; await refresh(); await openTicket(currentTicketId); showToast('Update added');
});
$('#detail-status-save').onclick = (event) => runAction(event.currentTarget, '#detail-error', async () => {
  await api(`/api/tickets/${currentTicketId}/status`, { method: 'POST', body: JSON.stringify({ status: $('#detail-status').value }) });
  await refresh(); await openTicket(currentTicketId); showToast('Status updated');
});
$('#detail-assign').onclick = (event) => runAction(event.currentTarget, '#detail-error', async () => {
  const assigneeId = $('#detail-assignee').value.trim();
  if (!assigneeId) throw Error('Enter an agent ID to assign this ticket.');
  await api(`/api/tickets/${currentTicketId}/assign`, { method: 'POST', body: JSON.stringify({ assignee_id: assigneeId }) });
  await refresh(); await openTicket(currentTicketId); showToast('Ticket assigned');
});
$('#detail-archive').onclick = async (event) => {
  const button = event.currentTarget;
  await runAction(button, '#detail-error', async () => {
    await api(`/api/tickets/${currentTicketId}/archive`, { method: 'POST' });
    $('#ticket-detail-dialog').close();
    await refresh();
    showToast(`Ticket SA-${currentTicketId} archived`);
  });
};
$('#profile').onclick = () => {
  $('#profile-name').textContent = currentUser.display_name;
  $('#profile-role').textContent = currentUser.role === 'admin' ? 'Administrator' : currentUser.role === 'agent' ? 'Support agent' : 'Customer';
  $('#profile-email').textContent = currentUser.email;
  $('#profile-avatar').textContent = (currentUser.display_name || currentUser.email).slice(0,1).toUpperCase();
  setNavOpen(false); $('#profile-dialog').showModal();
};
$('#ticket-detail-dialog').addEventListener('close', () => {
  const card = [...document.querySelectorAll('[data-ticket-id]')].find((element) => element.dataset.ticketId === String(currentTicketId));
  (card || $('#new-ticket')).focus();
});

// The drawer is modal on compact screens: trap focus and keep the workspace inert.
const compact = matchMedia('(max-width:1000px)');
function setNavOpen(open) {
  const expanded = open && compact.matches;
  $('#app-shell').classList.toggle('nav-open', expanded);
  document.body.classList.toggle('drawer-open', expanded);
  $('#nav-backdrop').hidden = !expanded;
  $('#open-nav').setAttribute('aria-expanded', String(expanded));
  $('#main-content').inert = expanded;
  if (expanded) requestAnimationFrame(() => { if ($('#app-shell').classList.contains('nav-open')) $('#close-nav').focus(); });
  else if (compact.matches && $('#sidebar').contains(document.activeElement)) $('#open-nav').focus();
}
$('#open-nav').onclick = () => setNavOpen(true);
$('#close-nav').onclick = $('#nav-backdrop').onclick = () => setNavOpen(false);
compact.addEventListener('change', () => setNavOpen(false));
document.addEventListener('keydown', (event) => {
  if (!$('#app-shell').classList.contains('nav-open')) return;
  if (event.key === 'Escape') { event.preventDefault(); setNavOpen(false); }
  if (event.key === 'Tab') {
    const controls = [...$('#sidebar').querySelectorAll('a,button')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
api('/api/auth/me').then(showDashboard).catch(() => $('#login-panel').classList.remove('hidden'));
