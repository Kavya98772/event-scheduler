// Runs the 10 demo scenarios against a running API: node scripts/demo-scenarios.js [baseUrl]
const BASE = process.argv[2] || 'http://localhost:5000/api';
const day = (n, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.toISOString(); };
let token, failed = 0;
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, data: res.status === 204 ? null : await res.json() };
};
const expect = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const idOf = async (name) => (await call('GET', '/events')).data.find((e) => e.event_name === name).event_id;

token = (await call('POST', '/auth/login', { email: 'admin1@uni.edu', password: 'password123' })).data.token;
const sch = await call('GET', '/schedules');
const E = Object.fromEntries(await Promise.all(['Data Science Workshop', 'Startup Pitch Competition', 'Open Mic Evening', 'Career Guidance Seminar', 'Game Dev Jam', 'Cloud Computing Seminar'].map(async (n) => [n, await idOf(n)])));
const cloud = sch.data.find((s) => s.event_name === 'Cloud Computing Seminar');
const robo = sch.data.find((s) => s.event_name === 'Robotics Competition');
const at = (s, h) => { const d = new Date(s.start_time); d.setHours(h, 0, 0, 0); return d.toISOString(); };

let r = await call('POST', '/events', { event_name: 'Demo Event', event_type_id: 1, max_participants: 30, duration_minutes: 60, registration_deadline: day(1, 0) });
expect('S1 create event', r.status === 201);
const demoId = r.data.event_id;
await call('PUT', `/events/${demoId}`, { status: 'OPEN' });
token = (await call('POST', '/auth/login', { email: 'student1@uni.edu', password: 'password123' })).data.token;
r = await call('POST', `/events/${E['Game Dev Jam']}/register`);
expect('S2 register (draft event is closed -> rejected)', r.status === 409, r.data.error?.message);
r = await call('POST', `/events/${demoId}/register`);
expect('S2 register participant', r.status === 201);
r = await call('POST', `/events/${demoId}/register`);
expect('S2b duplicate registration rejected', r.status === 409);
token = (await call('POST', '/auth/login', { email: 'admin1@uni.edu', password: 'password123' })).data.token;

r = await call('POST', '/schedules', { event_id: demoId, venue_id: 7, start_time: day(12, 15) });
expect('S3 schedule event successfully', r.status === 201);
r = await call('POST', '/schedules', { event_id: E['Game Dev Jam'], venue_id: cloud.venue_id, start_time: at(cloud, 11) });
expect('S4 venue overlap rejected', r.status === 409 && r.data.error.type === 'VENUE', r.data.error?.message);
r = await call('POST', '/schedules', { event_id: E['Data Science Workshop'], venue_id: 5, start_time: at(robo, 11) });
expect('S5 participant clash rejected', r.status === 409 && r.data.error.type === 'PARTICIPANT', r.data.error?.message);
r = await call('POST', '/schedules', { event_id: E['Open Mic Evening'], venue_id: 6, start_time: at(robo, 10), judge_ids: [3] });
expect('S6 judge overlap rejected', r.status === 409 && r.data.error.type === 'JUDGE', r.data.error?.message);
const e5 = sch.data.find((s) => s.event_name === 'AI Hackathon Finals');
r = await call('POST', '/schedules', { event_id: E['Open Mic Evening'], venue_id: 6, start_time: at(e5, 10), resources: [{ resource_id: 1, quantity: 2 }] });
expect('S7 resource shortage rejected', r.status === 409 && r.data.error.type === 'RESOURCE', r.data.error?.message);
r = await call('POST', '/schedules', { event_id: E['Career Guidance Seminar'], venue_id: 7, start_time: day(13, 10) });
expect('S8 over venue capacity rejected', r.status === 409 && r.data.error.type === 'CAPACITY', r.data.error?.message);
r = await call('POST', '/schedules', { event_id: E['Open Mic Evening'], venue_id: 6, start_time: at(e5, 18), judge_ids: [3], resources: [{ resource_id: 1, quantity: 2 }] });
expect('S9 schedule succeeds after resolving conflicts', r.status === 201, JSON.stringify(r.data));
const before = (await call('GET', '/resources')).data.find((x) => x.resource_id === 1);
const sid = r.data.schedule_id;
await call('DELETE', `/schedules/${sid}`);
const after = await call('POST', '/schedules/preview', { event_id: E['Open Mic Evening'], venue_id: 6, start_time: at(e5, 18), resources: [{ resource_id: 1, quantity: 3 }] });
expect('S10 removing schedule frees resources', after.data.checks.find((c) => c.check_name === 'Resources available').passed && before.allocations > 0);
const d = (await call('GET', '/dashboard')).data;
expect('dashboard logged the rejected attempts', d.stats.recent_conflict_count >= 8, `(${d.stats.recent_conflict_count} in last 30 days)`);
console.log(failed ? `\n${failed} FAILED` : '\nAll scenarios passed');
process.exit(failed ? 1 : 0);
