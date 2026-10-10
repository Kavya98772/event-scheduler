import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { ErrorBox } from '../components/ui.jsx';

export default function Login() {
  const { user, login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ email: 'admin1@uni.edu', password: 'password123' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (user) return <Navigate to="/" replace />;
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await (mode === 'login' ? login(f.email, f.password) : register({ ...f, year: Number(f.year) })); nav('/'); }
    catch (err) { setError(err.message); }
  };
  return (
    <div className="card login">
      <h1>Event Management &amp; Dynamic Scheduling</h1>
      <p className="muted">Database-driven conflict-free scheduling</p>
      <div className="tabs"><button className={mode === 'login' ? '' : 'ghost'} onClick={() => setMode('login')}>Sign in</button>
        <button className={mode === 'register' ? '' : 'ghost'} onClick={() => setMode('register')}>Register (student)</button></div>
      <ErrorBox error={error} />
      <form onSubmit={submit}>
        {mode === 'register' && <>
          <label>Name<input required value={f.name || ''} onChange={set('name')} /></label>
          <div className="row"><label>Registration no.<input required value={f.registration_number || ''} onChange={set('registration_number')} /></label>
            <label>Department<input required value={f.department || ''} onChange={set('department')} /></label></div>
          <div className="row"><label>Year<input type="number" min="1" max="6" required value={f.year || ''} onChange={set('year')} /></label>
            <label>Phone<input value={f.phone || ''} onChange={set('phone')} /></label></div></>}
        <label>Email<input type="email" required value={f.email} onChange={set('email')} /></label>
        <label>Password<input type="password" required value={f.password} onChange={set('password')} /></label>
        <button style={{ width: '100%' }}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      {mode === 'login' && <p className="muted" style={{ fontSize: 12 }}>Demo: admin1@uni.edu · organizer1@uni.edu · student1@uni.edu (password123)</p>}
    </div>
  );
}
