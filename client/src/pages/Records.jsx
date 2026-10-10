import { useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { Badge, ErrorBox, State, Table, fmt } from '../components/ui.jsx';

function EventPicker({ value, onChange }) {
  const { data } = useFetch('/events');
  return <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 360 }}><option value="">Select an event...</option>
    {(data || []).map((e) => <option key={e.event_id} value={e.event_id}>{e.event_name} ({e.status})</option>)}</select>;
}

export function Attendance() {
  const [eid, setEid] = useState('');
  const [error, setError] = useState('');
  const { data, loading, error: err, reload } = useFetch(eid ? `/attendance/${eid}` : null);
  const mark = async (r, attendance_status) => {
    setError('');
    try { await api.post('/attendance', { event_id: r.event_id, participant_id: r.participant_id, attendance_status }); reload(); } catch (e) { setError(e.message); }
  };
  return (
    <><div className="head"><h1>Attendance</h1><EventPicker value={eid} onChange={setEid} /></div>
      <ErrorBox error={error} />
      <div className="card">{!eid ? <div className="empty">Pick an event to record attendance.</div> :
        <State loading={loading} error={err} empty={data && !data.length}>{data && <Table rows={data} cols={[{ key: 'name', label: 'Participant' }, { key: 'registration_number', label: 'Reg. no.' },
          { label: 'Status', render: (r) => r.attendance_status ? <Badge s={r.attendance_status} /> : <span className="muted">not marked</span> }, { label: 'Check-in', render: (r) => fmt(r.check_in_time) },
          { label: 'Mark', render: (r) => <span style={{ display: 'flex', gap: 4 }}>{['PRESENT', 'LATE', 'ABSENT'].map((s) => <button key={s} className="ghost sm" onClick={() => mark(r, s)}>{s}</button>)}</span> }]} />}</State>}</div></>
  );
}

export function Results() {
  const { isStaff } = useAuth();
  const [eid, setEid] = useState('');
  const [error, setError] = useState('');
  const { data, loading, error: err, reload } = useFetch(eid ? `/results/${eid}` : null);
  const [edit, setEdit] = useState({});
  const save = async (r) => {
    setError('');
    const e = edit[r.participant_id] || {};
    try { await api.post('/results', { event_id: r.event_id, participant_id: r.participant_id, position: e.position ?? r.position, score: e.score ?? r.score, remarks: e.remarks ?? r.remarks }); reload(); setEdit({}); }
    catch (x) { setError(x.message); }
  };
  const inp = (r, k, w) => isStaff ? <input style={{ width: w }} defaultValue={r[k] ?? ''} onChange={(e) => setEdit({ ...edit, [r.participant_id]: { ...edit[r.participant_id], [k]: e.target.value } })} /> : r[k] ?? '-';
  return (
    <><div className="head"><h1>Results</h1><EventPicker value={eid} onChange={setEid} /></div>
      <ErrorBox error={error} />
      <div className="card">{!eid ? <div className="empty">Pick an event to view results.</div> :
        <State loading={loading} error={err} empty={data && !data.length}>{data && <Table rows={data} cols={[{ key: 'name', label: 'Participant' }, { key: 'registration_number', label: 'Reg. no.' },
          { label: 'Position', render: (r) => inp(r, 'position', 70) }, { label: 'Score', render: (r) => inp(r, 'score', 80) }, { label: 'Remarks', render: (r) => inp(r, 'remarks', 160) },
          ...(isStaff ? [{ label: '', render: (r) => <button className="sm" onClick={() => save(r)}>Save</button> }] : [])]} />}</State>}</div></>
  );
}
