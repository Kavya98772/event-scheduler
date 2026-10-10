import { useFetch } from '../hooks/useFetch.js';
import { Bars, State, Stat, Table } from '../components/ui.jsx';

export default function Analytics() {
  const { data: d, loading, error } = useFetch('/analytics');
  return (
    <>
      <div className="head"><h1>Analytics</h1></div>
      <State loading={loading} error={error}>{d && <>
        <div className="grid"><Stat label="Average attendance %" value={d.average_attendance_pct} /><Stat label="Most popular event" value={d.popular[0]?.event_name} /></div>
        <div className="grid2">
          <div className="card"><h3>Registrations by event (rank)</h3><Bars rows={d.popular} label="event_name" value="registered" /></div>
          <div className="card"><h3>Attendance % by event</h3><Bars rows={d.attendance} label="event_name" value="attendance_pct" suffix="%" /></div>
          <div className="card"><h3>Highest fill rate</h3><Bars rows={d.highest} label="event_name" value="fill_pct" suffix="%" /></div>
          <div className="card"><h3>Participation by department</h3><Bars rows={d.departments} label="department" value="registrations" /></div>
          <div className="card"><h3>Venue utilization (booked hours)</h3><Bars rows={d.venues} label="venue_name" value="booked_hours" /></div>
          <div className="card"><h3>Resource utilization (unit-hours)</h3><Bars rows={d.resources} label="resource_name" value="unit_hours" /></div>
          <div className="card"><h3>Judge workload</h3><Table rows={d.judges} cols={[{ key: 'workload_rank', label: '#' }, { key: 'name', label: 'Judge' }, { key: 'assignments', label: 'Sessions' }, { key: 'hours', label: 'Hours' }]} /></div>
          <div className="card"><h3>Volunteer workload</h3><Table rows={d.volunteers} cols={[{ key: 'workload_rank', label: '#' }, { key: 'name', label: 'Volunteer' }, { key: 'assignments', label: 'Sessions' }, { key: 'hours', label: 'Hours' }]} /></div>
        </div>
        <div className="card"><h3>Average attendance by event type</h3><Table rows={d.byType} cols={[{ key: 'type_name', label: 'Type' }, { key: 'events', label: 'Events' }, { key: 'avg_registrations', label: 'Avg registrations' }, { key: 'avg_attendance_pct', label: 'Avg attendance %' }]} /></div>
      </>}</State>
    </>
  );
}
