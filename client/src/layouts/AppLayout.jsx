import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

const NAV = [['/', 'Dashboard'], ['/events', 'Events'], ['/schedule', 'Schedule'], ['/participants', 'Participants', true], ['/venues', 'Venues'],
  ['/judges', 'Judges'], ['/volunteers', 'Volunteers'], ['/resources', 'Resources'], ['/attendance', 'Attendance', true], ['/results', 'Results'], ['/analytics', 'Analytics']];

export default function AppLayout() {
  const { user, logout, isStaff } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="app">
      <nav className="side">
        <h2>Event Scheduler</h2>
        {NAV.filter(([, , staffOnly]) => !staffOnly || isStaff).map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
        ))}
        <div className="who">{user.name}<br /><span className="muted">{user.role}</span><br /><a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>Sign out</a></div>
      </nav>
      <main className="main"><Outlet /></main>
    </div>
  );
}
