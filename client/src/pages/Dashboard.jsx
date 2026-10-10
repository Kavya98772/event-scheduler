import { useFetch } from '../hooks/useFetch.js';
import { Stat, State, Table, Badge, fmt } from '../components/ui.jsx';

export default function Dashboard() {
  const { data, loading, error } = useFetch('/dashboard');
  const s = data?.stats;
  return (
    <>
      <div className="head"><h1>Dashboard</h1></div>
      <State loading={loading} error={error}>
        {data && <>
          <div className="grid">
            <Stat label="Total events" value={s.total_events} /><Stat label="Upcoming events" value={s.upcoming_events} />
            <Stat label="Participants" value={s.total_participants} /><Stat label="Available venues" value={s.available_venues} />
            <Stat label="Active judges" value={s.active_judges} /><Stat label="Rejected scheduling attempts (30d)" value={s.recent_conflict_count} />
            <Stat label="Live participant clashes" value={s.open_conflicts} />
          </div>
          <div className="card"><h3>Upcoming schedule</h3>
            <State empty={!data.upcoming_schedule.length}>
              <Table rows={data.upcoming_schedule} cols={[{ key: 'event_name', label: 'Event' }, { key: 'venue_name', label: 'Venue' },
                { label: 'When', render: (r) => fmt(r.start_time) }, { key: 'registered', label: 'Registered' }, { label: 'Status', render: (r) => <Badge s={r.schedule_status} /> }]} />
            </State></div>
          <div className="grid2">
            <div className="card"><h3>Recent registrations</h3><Table rows={data.recent_registrations}
              cols={[{ key: 'participant_name', label: 'Participant' }, { key: 'event_name', label: 'Event' }, { label: 'When', render: (r) => fmt(r.registration_date) }]} /></div>
            <div className="card"><h3>Recent scheduling conflicts</h3><State empty={!data.recent_conflicts.length}>
              <Table rows={data.recent_conflicts} cols={[{ label: 'Type', render: (r) => <Badge s={r.conflict_type} /> }, { key: 'event_name', label: 'Event' }, { key: 'message', label: 'Reason' }]} /></State></div>
          </div>
          <div className="card"><h3>Resource utilization (unit-hours)</h3>
            <Table rows={data.resource_utilization} cols={[{ key: 'resource_name', label: 'Resource' }, { key: 'total_quantity', label: 'Total' }, { key: 'upcoming_units', label: 'Upcoming units' }, { key: 'unit_hours', label: 'Unit-hours' }]} /></div>
        </>}
      </State>
    </>
  );
}
