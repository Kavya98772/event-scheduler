import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { Badge, Confirm, ErrorBox, State, Table, fmt, toLocalInput } from '../components/ui.jsx';

export function Events() {
  const { isStaff } = useAuth();
  const [status, setStatus] = useState('');
  const { data, loading, error } = useFetch('/events' + (status ? `?status=${status}` : ''));
  return (
    <>
      <div className="head"><h1>Events</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>{['DRAFT', 'OPEN', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}
          </select>
          {isStaff && <Link className="btn" to="/events/new" style={{ whiteSpace: 'nowrap' }}>+ Create event</Link>}
        </div></div>
      <div className="card"><State loading={loading} error={error} empty={data && !data.length}>
        {data && <Table rows={data} cols={[
          { label: 'Event', render: (r) => <Link to={`/events/${r.event_id}`}>{r.event_name}</Link> }, { key: 'type_name', label: 'Type' },
          { key: 'organizer_name', label: 'Organizer' }, { label: 'Registered', render: (r) => `${r.registered} / ${r.max_participants}` },
          { label: 'Next session', render: (r) => fmt(r.next_start) }, { label: 'Status', render: (r) => <Badge s={r.status} /> }]} />}
      </State></div>
    </>
  );
}

export function EventForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const types = useFetch('/event-types');
  const existing = useFetch(id ? `/events/${id}` : null);
  const [f, setF] = useState(null);
  const [error, setError] = useState('');
  const form = f || (existing.data && { ...existing.data, registration_deadline: toLocalInput(existing.data.registration_deadline) }) ||
    { event_name: '', description: '', event_type_id: '', max_participants: 50, duration_minutes: 120, registration_deadline: '', status: 'OPEN' };
  const set = (k) => (e) => setF({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError('');
    const body = { ...form, event_type_id: Number(form.event_type_id), max_participants: Number(form.max_participants),
      duration_minutes: Number(form.duration_minutes), registration_deadline: new Date(form.registration_deadline).toISOString() };
    try { const ev = id ? await api.put(`/events/${id}`, body) : await api.post('/events', body); nav(`/events/${ev.event_id}`); }
    catch (err) { setError(err.message); }
  };
  return (
    <>
      <div className="head"><h1>{id ? 'Edit event' : 'Create event'}</h1></div>
      <div className="card" style={{ maxWidth: 640 }}>
        <ErrorBox error={error || types.error} />
        <form onSubmit={submit}>
          <label>Name<input required value={form.event_name} onChange={set('event_name')} /></label>
          <label>Description<textarea rows="2" value={form.description || ''} onChange={set('description')} /></label>
          <div className="row">
            <label>Type<select required value={form.event_type_id} onChange={set('event_type_id')}><option value="">Select...</option>
              {(types.data || []).map((t) => <option key={t.event_type_id} value={t.event_type_id}>{t.type_name}</option>)}</select></label>
            <label>Status<select value={form.status} onChange={set('status')}>{['DRAFT', 'OPEN', 'CANCELLED'].concat(id ? ['SCHEDULED', 'COMPLETED'] : []).map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          <div className="row">
            <label>Max participants<input type="number" min="1" required value={form.max_participants} onChange={set('max_participants')} /></label>
            <label>Duration (minutes)<input type="number" min="1" required value={form.duration_minutes} onChange={set('duration_minutes')} /></label>
          </div>
          <label>Registration deadline<input type="datetime-local" required value={form.registration_deadline} onChange={set('registration_deadline')} /></label>
          <button>{id ? 'Save changes' : 'Create event'}</button>
        </form>
      </div>
    </>
  );
}

export function EventDetails() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, isStaff, isAdmin } = useAuth();
  const { data: e, loading, error, reload } = useFetch(`/events/${id}`);
  const regs = useFetch(isStaff ? `/events/${id}/registrations` : null);
  const all = useFetch(isStaff ? '/events' : null);
  const [msg, setMsg] = useState({ error: '', ok: '' });
  const [confirm, setConfirm] = useState(false);
  const [prereq, setPrereq] = useState('');
  const run = async (fn, ok) => {
    setMsg({ error: '', ok: '' });
    try { await fn(); setMsg({ error: '', ok }); reload(); regs.reload(); } catch (err) { setMsg({ error: err.message, ok: '' }); }
  };
  const mine = isAdmin || e?.organizer_id === user.id;
  return (
    <State loading={loading} error={error}>
      {e && <>
        <div className="head"><h1>{e.event_name} <Badge s={e.status} /></h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {user.role === 'PARTICIPANT' && (e.my_registration === 'REGISTERED'
              ? <button className="ghost" onClick={() => run(() => api.del(`/events/${id}/register`), 'Registration cancelled')}>Cancel registration</button>
              : <button onClick={() => run(() => api.post(`/events/${id}/register`), 'Registered successfully')}>Register</button>)}
            {mine && isStaff && <><button className="ghost" onClick={() => nav(`/events/${id}/edit`)}>Edit</button><button className="danger" onClick={() => setConfirm(true)}>Delete</button></>}
          </div></div>
        <ErrorBox error={msg.error} />{msg.ok && <div className="card" style={{ color: 'var(--ok)' }}>{msg.ok}</div>}
        <div className="card"><p>{e.description || 'No description.'}</p>
          <p className="muted">{e.type_name} · organised by {e.organizer_name} · {e.duration_minutes} min · {e.registered}/{e.max_participants} registered · registration closes {fmt(e.registration_deadline)}</p></div>
        <div className="card"><h3>Sessions</h3><State empty={!e.schedules.length}>
          <Table rows={e.schedules} cols={[{ key: 'venue_name', label: 'Venue' }, { label: 'Start', render: (r) => fmt(r.start_time) }, { label: 'End', render: (r) => fmt(r.end_time) },
            { label: 'Judges', render: (r) => r.judges.join(', ') || '-' }, { label: 'Status', render: (r) => <Badge s={r.status} /> }]} /></State>
          {isStaff && <p><Link to="/schedule">Go to Schedule to book a session</Link></p>}</div>
        <div className="card"><h3>Prerequisites</h3>
          {e.dependencies.length ? <Table rows={e.dependencies} cols={[{ key: 'prerequisite_name', label: 'Prerequisite event' }, { key: 'dependency_type', label: 'Type' },
            ...(mine && isStaff ? [{ label: '', render: (r) => <button className="ghost sm" onClick={() => run(() => api.del(`/events/${id}/dependencies/${r.dependency_id}`), 'Removed')}>Remove</button> }] : [])]} /> : <p className="muted">None.</p>}
          {mine && isStaff && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <select value={prereq} onChange={(ev) => setPrereq(ev.target.value)}><option value="">Add a prerequisite event...</option>
              {(all.data || []).filter((x) => x.event_id !== Number(id)).map((x) => <option key={x.event_id} value={x.event_id}>{x.event_name}</option>)}</select>
            <button disabled={!prereq} onClick={() => run(() => api.post(`/events/${id}/dependencies`, { prerequisite_event_id: Number(prereq) }), 'Prerequisite added')}>Add</button></div>}</div>
        {isStaff && <div className="card"><h3>Registrations ({regs.data?.length ?? 0})</h3><State loading={regs.loading} error={regs.error} empty={regs.data && !regs.data.length}>
          {regs.data && <Table rows={regs.data} cols={[{ key: 'name', label: 'Name' }, { key: 'registration_number', label: 'Reg. no.' }, { key: 'department', label: 'Dept' },
            { label: 'Registered', render: (r) => fmt(r.registration_date) }, { label: 'Status', render: (r) => <Badge s={r.status} /> }]} />}</State></div>}
        {confirm && <Confirm text={`Delete "${e.event_name}" and all its schedules and registrations?`} onNo={() => setConfirm(false)}
          onYes={async () => { try { await api.del(`/events/${id}`); nav('/events'); } catch (err) { setConfirm(false); setMsg({ error: err.message, ok: '' }); } }} />}
      </>}
    </State>
  );
}
