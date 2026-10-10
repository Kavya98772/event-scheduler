import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { Events, EventForm, EventDetails } from './pages/Events.jsx';
import Schedule from './pages/Schedule.jsx';
import { Participants, Venues, Judges, Volunteers, Resources } from './pages/Lists.jsx';
import { Attendance, Results } from './pages/Records.jsx';
import Analytics from './pages/Analytics.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="events" element={<Events />} />
          <Route path="events/new" element={<EventForm />} />
          <Route path="events/:id" element={<EventDetails />} />
          <Route path="events/:id/edit" element={<EventForm />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="participants" element={<Participants />} />
          <Route path="venues" element={<Venues />} />
          <Route path="judges" element={<Judges />} />
          <Route path="volunteers" element={<Volunteers />} />
          <Route path="resources" element={<Resources />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="results" element={<Results />} />
          <Route path="analytics" element={<Analytics />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
