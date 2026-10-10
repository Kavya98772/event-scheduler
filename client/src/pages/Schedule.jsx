import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { Badge, Confirm, ErrorBox, Modal, State, Table, fmt } from '../components/ui.jsx';

const H0 = 6, H1 = 22;
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA');
const hoursOf = (d) => { const x = new Date(d); return x.getHours() + x.getMinutes() / 60; };

function Timeline({ rows, venues, day }) {
  const items = rows.filter((s) => dayKey(s.start_time) === day);
  const lanes = venues.filter((v) => v.status !== 'MAINTENANCE');
  return (
    <div className="tl">
      <div className="tl-hours">{Array.from({ length: H1 - H0 }, (_, i) => <span key={i}>{H0 + i}</span>)}</div>
      {lanes.map((v) => (
        <div className="tl-row" key={v.venue_id}><div className="tl-label">{v.venue_name}</div>
          {items.filter((s) => s.venue_id === v.venue_id).map((s) => {
            const a = Math.max(H0, hoursOf(s.start_time)), b = Math.min(H1, hoursOf(s.end_time) || H1);
            return <div key={s.schedule_id} className={'tl-block ' + s.status.toLowerCase()} title={`${s.event_name}\n${fmt(s.start_time)} - ${fmt(s.end_time)}\nOrganizer: ${s.organizer_name}\nJudges: ${s.judges.join(', ') || '-'}`}
              style={{ left: `${((a - H0) / (H1 - H0)) * 100}%`, width: `${((b - a) / (H1 - H0)) * 100}%` }}>{s.event_name}</div>;
          })}</div>))}
    </div>
  );
}

function ScheduleForm({ onClose, onDone }) {
  const events = useFetch('/events'), venues = useFetch('/venues'), judges = useFetch('/judges'), vols = useFetch('/volunteers'), res = useFetch('/resources');
  const [f, setF] = useState({ event_id: '', venue_id: '', start: '' });
  const [judgeIds, setJudgeIds] = useState([]);
  const [volIds, setVolIds] = useState([]);
  const [qty, setQty] = useState({});
  const [checks, setChecks] = useState(null);
  const [error, setError] = useState('');
  const payload = useMemo(() => f.event_id && f.venue_id && f.start ? {
    event_id: Number(f.event_id), venue_id: Number(f.venue_id), start_time: new Date(f.start).toISOString(), judge_ids: judgeIds,
    volunteers: volIds.map((id) => ({ volunteer_id: id, responsibility: 'Support' })),
    resources: Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([id, q]) => ({ resource_id: Number(id), quantity: Number(q) })) } : null, [f, judgeIds, volIds, qty]);
  // Every change re-runs the database's own checks (preview_schedule); the UI never decides conflicts itself.
  useEffect(() => {
    if (!payload) return undefined;
    const t = setTimeout(() => api.post('/schedules/preview', payload).then(setChecks).catch((e) => setError(e.message)), 300);
    return () => clearTimeout(t);
  }, [payload]);
  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const submit = async () => {
    setError('');
    try { await api.post('/schedules', payload); onDone(); } catch (e) { setError(e.message); }
  };
  const ok = checks?.ok;
  return (
    <Modal title="Schedule an event" onClose={onClose} wide>
      <ErrorBox error={error} />
      <div className="row">
        <div>
          <label>Event<select value={f.event_id} onChange={(e) => setF({ ...f, event_id: e.target.value })}><option value="">Select...</option>
            {(events.data || []).filter((e) => ['DRAFT', 'OPEN', 'SCHEDULED'].includes(e.status)).map((e) => <option key={e.event_id} value={e.event_id}>{e.event_name} ({e.registered} reg.)</option>)}</select></label>
          <label>Venue<select value={f.venue_id} onChange={(e) => setF({ ...f, venue_id: e.target.value })}><option value="">Select...</option>
            {(venues.data || []).map((v) => <option key={v.venue_id} value={v.venue_id}>{v.venue_name} (cap. {v.capacity}){v.status !== 'AVAILABLE' ? ` - ${v.status}` : ''}</option>)}</select></label>
          <label>Start time (end = start + event duration)<input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label>Judges</label><div className="pick">{(judges.data || []).map((j) => <label key={j.judge_id}><input type="checkbox" checked={judgeIds.includes(j.judge_id)} onChange={() => toggle(judgeIds, setJudgeIds, j.judge_id)} />{j.name} <span className="muted">{j.specialization}</span></label>)}</div>
          <label>Volunteers</label><div className="pick">{(vols.data || []).map((v) => <label key={v.volunteer_id}><input type="checkbox" checked={volIds.includes(v.volunteer_id)} onChange={() => toggle(volIds, setVolIds, v.volunteer_id)} />{v.name}</label>)}</div>
          <label>Resources (quantity)</label><div className="pick">{(res.data || []).map((r) => <label key={r.resource_id}>{r.resource_name} <span className="muted">/ {r.total_quantity}</span>
            <input type="number" min="0" value={qty[r.resource_id] || ''} placeholder="0" onChange={(e) => setQty({ ...qty, [r.resource_id]: e.target.value })} /></label>)}</div>
        </div>
        <div>
          <h3>Validation (checked by the database)</h3>
          {!checks && <p className="muted">Choose an event, venue and start time to run the checks.</p>}
          {checks && <ul className="checks">{checks.checks.map((c) => <li key={c.check_name} className={c.passed ? 'ok' : 'no'}><b>{c.passed ? '✓' : '✗'} {c.check_name}</b><br /><span style={{ fontSize: 12 }}>{c.message}</span></li>)}</ul>}
          <button disabled={!payload} onClick={submit}>{ok ? 'Confirm schedule' : 'Try to schedule anyway'}</button>
          <p className="muted" style={{ fontSize: 12 }}>The booking runs as one transaction; if any check fails nothing is saved.</p>
        </div>
      </div>
    </Modal>
  );
}

export default function Schedule() {
  const { isStaff } = useAuth();
  const { data, loading, error, reload } = useFetch('/schedules');
  const venues = useFetch('/venues');
  const [day, setDay] = useState(null);
  const [form, setForm] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [err, setErr] = useState('');
  const days = useMemo(() => [...new Set((data || []).map((s) => dayKey(s.start_time)))].sort(), [data]);
  const today = dayKey(new Date());
  const current = day || days.find((d) => d >= today) || days[days.length - 1] || today;
  const shift = (n) => { const d = new Date(current + 'T12:00:00'); d.setDate(d.getDate() + n); setDay(dayKey(d)); };
  const act = async () => {
    try { confirm.kind === 'cancel' ? await api.post(`/schedules/${confirm.s.schedule_id}/cancel`) : await api.del(`/schedules/${confirm.s.schedule_id}`); reload(); }
    catch (e) { setErr(e.message); }
    setConfirm(null);
  };
  return (
    <>
      <div className="head"><h1>Schedule</h1>{isStaff && <button onClick={() => setForm(true)}>+ Schedule event</button>}</div>
      <ErrorBox error={err} />
      <State loading={loading || venues.loading} error={error || venues.error}>
        {data && venues.data && <>
          <div className="card">
            <div className="head"><h3>Venue timeline</h3><div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button className="ghost sm" onClick={() => shift(-1)}>‹</button><input type="date" value={current} onChange={(e) => setDay(e.target.value)} style={{ width: 150 }} />
              <button className="ghost sm" onClick={() => shift(1)}>›</button></div></div>
            <Timeline rows={data} venues={venues.data} day={current} />
          </div>
          <div className="card"><h3>All sessions</h3><State empty={!data.length}>
            <Table rows={data} cols={[{ key: 'event_name', label: 'Event' }, { key: 'venue_name', label: 'Venue' }, { label: 'Start', render: (r) => fmt(r.start_time) }, { label: 'End', render: (r) => fmt(r.end_time) },
              { key: 'organizer_name', label: 'Organizer' }, { label: 'Judges', render: (r) => r.judges.join(', ') || '-' }, { label: 'Status', render: (r) => <Badge s={r.status} /> },
              ...(isStaff ? [{ label: '', render: (r) => r.status === 'SCHEDULED' && <span style={{ display: 'flex', gap: 4 }}>
                <button className="ghost sm" onClick={() => setConfirm({ kind: 'cancel', s: r })}>Cancel</button><button className="danger sm" onClick={() => setConfirm({ kind: 'delete', s: r })}>Delete</button></span> }] : [])]} /></State></div>
        </>}
      </State>
      {form && <ScheduleForm onClose={() => setForm(false)} onDone={() => { setForm(false); reload(); }} />}
      {confirm && <Confirm text={`${confirm.kind === 'cancel' ? 'Cancel' : 'Delete'} the session of "${confirm.s.event_name}"? Its resources and assignments are released.`} onNo={() => setConfirm(null)} onYes={act} />}
    </>
  );
}
