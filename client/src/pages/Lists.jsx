import { useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { Badge, ErrorBox, Modal, State, Table, fmt } from '../components/ui.jsx';

function Page({ title, state, cols, action, children }) {
  return (
    <>
      <div className="head"><h1>{title}</h1>{action}</div>
      <div className="card"><State loading={state.loading} error={state.error} empty={state.data && !state.data.length}>{state.data && <Table rows={state.data} cols={cols} />}</State></div>
      {children}
    </>
  );
}

function AddModal({ title, fields, path, onClose, onDone }) {
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(fields.map(([k, , type]) => [k, type === 'number' ? Number(f[k]) : f[k]]));
    try { await api.post(path, body); onDone(); } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={title} onClose={onClose}><ErrorBox error={error} />
      <form onSubmit={submit}>{fields.map(([k, label, type]) => <label key={k}>{label}<input required type={type || 'text'} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}<button>Save</button></form>
    </Modal>
  );
}

export const Participants = () => {
  const s = useFetch('/participants');
  return <Page title="Participants" state={s} cols={[{ key: 'name', label: 'Name' }, { key: 'registration_number', label: 'Reg. no.' }, { key: 'department', label: 'Dept' },
    { key: 'year', label: 'Year' }, { key: 'email', label: 'Email' }, { key: 'events_registered', label: 'Events' }]} />;
};

export function Venues() {
  const { isAdmin } = useAuth();
  const s = useFetch('/venues');
  const [add, setAdd] = useState(false);
  const setStatus = async (v, status) => { await api.put(`/venues/${v.venue_id}`, { status }).catch(() => {}); s.reload(); };
  return <Page title="Venues" state={s} action={isAdmin && <button onClick={() => setAdd(true)}>+ Add venue</button>}
    cols={[{ key: 'venue_name', label: 'Venue' }, { key: 'building', label: 'Building' }, { key: 'capacity', label: 'Capacity' }, { key: 'sessions', label: 'Sessions' },
      { key: 'booked_hours', label: 'Booked hrs' }, { label: 'Avg fill %', render: (r) => r.avg_fill_pct ?? '-' },
      { label: 'Status', render: (r) => isAdmin ? <select value={r.status} onChange={(e) => setStatus(r, e.target.value)} style={{ width: 130 }}>{['AVAILABLE', 'MAINTENANCE', 'CLOSED'].map((x) => <option key={x}>{x}</option>)}</select> : <Badge s={r.status} /> }]}>
    {add && <AddModal title="Add venue" path="/venues" onClose={() => setAdd(false)} onDone={() => { setAdd(false); s.reload(); }}
      fields={[['venue_name', 'Name'], ['building', 'Building'], ['floor', 'Floor', 'number'], ['capacity', 'Capacity', 'number'], ['venue_type', 'Type']]} />}
  </Page>;
}

const People = ({ title, path, putPath }) => {
  const { isStaff } = useAuth();
  const s = useFetch(path);
  const toggle = async (r, id) => { await api.put(`${putPath}/${id}`, { availability_status: r.availability_status === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE' }).catch(() => {}); s.reload(); };
  return <Page title={title} state={s} cols={[{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { label: title === 'Judges' ? 'Specialization' : 'Department', render: (r) => r.specialization || r.department },
    { key: 'assignments', label: 'Assignments' }, { label: 'Availability', render: (r) => <Badge s={r.availability_status} /> },
    ...(isStaff ? [{ label: '', render: (r) => <button className="ghost sm" onClick={() => toggle(r, r.judge_id || r.volunteer_id)}>Toggle</button> }] : [])]} />;
};
export const Judges = () => <People title="Judges" path="/judges" putPath="/judges" />;
export const Volunteers = () => <People title="Volunteers" path="/volunteers" putPath="/volunteers" />;

export function Resources() {
  const { isAdmin } = useAuth();
  const s = useFetch('/resources');
  const al = useFetch('/resource-allocations');
  const [add, setAdd] = useState(false);
  return <Page title="Resources" state={s} action={isAdmin && <button onClick={() => setAdd(true)}>+ Add resource</button>}
    cols={[{ key: 'resource_name', label: 'Resource' }, { key: 'resource_type', label: 'Type' }, { key: 'total_quantity', label: 'Total' }, { key: 'available_quantity', label: 'Free now' },
      { key: 'allocations', label: 'Allocations' }, { key: 'unit_hours', label: 'Unit-hours' }, { label: 'Status', render: (r) => <Badge s={r.status} /> }]}>
    <div className="card"><h3>Allocations</h3><State loading={al.loading} error={al.error} empty={al.data && !al.data.length}>{al.data && <Table rows={al.data} cols={[{ key: 'resource_name', label: 'Resource' }, { key: 'quantity', label: 'Qty' },
      { key: 'event_name', label: 'Event' }, { label: 'Start', render: (r) => fmt(r.start_time) }, { label: 'End', render: (r) => fmt(r.end_time) }, { label: 'Status', render: (r) => <Badge s={r.status} /> }]} />}</State></div>
    {add && <AddModal title="Add resource" path="/resources" onClose={() => setAdd(false)} onDone={() => { setAdd(false); s.reload(); }}
      fields={[['resource_name', 'Name'], ['resource_type', 'Type'], ['total_quantity', 'Total quantity', 'number']]} />}
  </Page>;
}
