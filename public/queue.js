export const statusLabels = { open: 'Open', in_progress: 'In progress', waiting_customer: 'Waiting on customer', closed: 'Closed' };
export const priorityLabels = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
export const defaultFilters = { search: '', status: 'active', priority: 'all', assignee: 'all', sort: 'recent' };
const urgency = { urgent: 0, high: 1, normal: 2, low: 3 };
const timestamp = (value) => Date.parse(value) || 0;

export function selectTickets(tickets, filters) {
  const term = filters.search.trim().toLowerCase();
  return tickets.filter((ticket) => {
    const statusMatches = filters.status === 'all' || (filters.status === 'active' ? ticket.status !== 'closed' : ticket.status === filters.status);
    const assigneeMatches = filters.assignee === 'all' || (filters.assignee === 'unassigned' ? !ticket.assignee_id : String(ticket.assignee_id) === filters.assignee);
    return statusMatches && assigneeMatches && (filters.priority === 'all' || ticket.priority === filters.priority)
      && `SA-${ticket.id} ${ticket.subject} ${ticket.customer_email} ${ticket.description || ''}`.toLowerCase().includes(term);
  }).sort((a, b) => {
    if (filters.sort === 'oldest') return timestamp(a.created_at) - timestamp(b.created_at) || Number(a.id) - Number(b.id);
    if (filters.sort === 'newest') return timestamp(b.created_at) - timestamp(a.created_at) || Number(b.id) - Number(a.id);
    if (filters.sort === 'urgency') return (urgency[a.priority] ?? 4) - (urgency[b.priority] ?? 4) || timestamp(b.updated_at) - timestamp(a.updated_at);
    return timestamp(b.updated_at) - timestamp(a.updated_at) || Number(b.id) - Number(a.id);
  });
}

export function ticketCounts(tickets) {
  return {
    open: tickets.filter((ticket) => ticket.status === 'open').length,
    active: tickets.filter((ticket) => ticket.status === 'in_progress').length,
    urgent: tickets.filter((ticket) => ticket.priority === 'urgent').length,
  };
}
