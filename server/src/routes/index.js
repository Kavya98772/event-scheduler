import { Router } from 'express';
import { authenticate, requireRole, staff } from '../middleware/auth.js';
import { ah } from '../middleware/errors.js';
import * as auth from '../controllers/auth.js';
import * as ev from '../controllers/events.js';
import * as sc from '../controllers/schedules.js';
import * as pe from '../controllers/people.js';
import * as rs from '../controllers/resources.js';
import * as mi from '../controllers/misc.js';
import * as an from '../controllers/analytics.js';

const r = Router();
const admin = requireRole('ADMIN');
r.post('/auth/login', ah(auth.login));
r.post('/auth/register', ah(auth.register));
r.use(authenticate);

r.get('/event-types', ah(ev.types));
r.get('/events', ah(ev.list));
r.post('/events', staff, ah(ev.create));
r.get('/events/:id', ah(ev.get));
r.put('/events/:id', staff, ah(ev.update));
r.delete('/events/:id', staff, ah(ev.remove));
r.post('/events/:id/register', requireRole('PARTICIPANT'), ah(ev.register));
r.delete('/events/:id/register', requireRole('PARTICIPANT'), ah(ev.unregister));
r.get('/events/:id/registrations', staff, ah(ev.registrations));
r.post('/events/:id/dependencies', staff, ah(ev.addDependency));
r.delete('/events/:id/dependencies/:depId', staff, ah(ev.removeDependency));

r.get('/venues', ah(mi.venues));
r.get('/venues/available', ah(mi.availableVenues));
r.post('/venues', admin, ah(mi.createVenue));
r.put('/venues/:id', admin, ah(mi.updateVenue));

r.post('/schedules/preview', staff, ah(sc.preview));
r.get('/schedules', ah(sc.list));
r.post('/schedules', staff, ah(sc.create));
r.get('/schedules/:id', ah(sc.get));
r.put('/schedules/:id', staff, ah(sc.update));
r.post('/schedules/:id/cancel', staff, ah(sc.cancel));
r.delete('/schedules/:id', staff, ah(sc.remove));

r.get('/participants', staff, ah(pe.participants));
r.get('/participants/:id/schedule', ah(pe.participantSchedule));
r.get('/judges', ah(pe.judges));
r.put('/judges/:id', staff, ah(pe.updateJudge));
r.get('/volunteers', ah(pe.volunteers));
r.put('/volunteers/:id', staff, ah(pe.updateVolunteer));
r.get('/judge-assignments', ah(pe.judgeAssignments));
r.post('/judge-assignments', staff, ah(pe.assignJudge));
r.delete('/judge-assignments/:id', staff, ah(pe.unassignJudge));
r.get('/volunteer-assignments', ah(pe.volunteerAssignments));
r.post('/volunteer-assignments', staff, ah(pe.assignVolunteer));
r.delete('/volunteer-assignments/:id', staff, ah(pe.unassignVolunteer));

r.get('/resources', ah(rs.list));
r.post('/resources', admin, ah(rs.create));
r.put('/resources/:id', admin, ah(rs.update));
r.get('/resource-allocations', ah(rs.allocations));
r.post('/resource-allocations', staff, ah(rs.allocate));
r.delete('/resource-allocations/:id', staff, ah(rs.deallocate));

r.get('/attendance/:eventId', staff, ah(mi.attendance));
r.post('/attendance', staff, ah(mi.markAttendance));
r.get('/results/:eventId', ah(mi.results));
r.post('/results', staff, ah(mi.saveResult));

r.get('/dashboard', ah(an.dashboard));
r.get('/analytics', ah(an.analytics));
export default r;
