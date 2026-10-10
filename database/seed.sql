-- seed.sql | Realistic data; all dates are relative to the day the seed is run.
-- Logins (password for everyone: password123): admin1@uni.edu, organizer1@uni.edu, student1@uni.edu, judge1@uni.edu, volunteer1@uni.edu
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users(name, email, phone, password_hash, role)
SELECT (ARRAY['Aarav','Diya','Vihaan','Ananya','Aditya','Ishita','Rohan','Kavya','Arjun','Meera','Karthik','Sneha'])[(i-1)%12+1] || ' ' ||
       (ARRAY['Sharma','Iyer','Reddy','Nair','Patel','Kumar','Menon','Das'])[(i*3)%8+1],
       CASE WHEN i<=2 THEN 'admin'||i WHEN i<=7 THEN 'organizer'||(i-2) WHEN i<=37 THEN 'student'||(i-7)
            WHEN i<=42 THEN 'judge'||(i-37) ELSE 'volunteer'||(i-42) END || '@uni.edu',
       '9' || lpad((100000000 + i*7919)::text, 9, '0'),
       crypt('password123', gen_salt('bf')),
       CASE WHEN i<=2 THEN 'ADMIN' WHEN i<=7 THEN 'ORGANIZER' WHEN i<=37 THEN 'PARTICIPANT'
            WHEN i<=42 THEN 'JUDGE' ELSE 'VOLUNTEER' END
FROM generate_series(1,52) i;

INSERT INTO participant(user_id, registration_number, department, year)
SELECT 7+i, '26BCE' || lpad(i::text,4,'0'), (ARRAY['CSE','ECE','EEE','MECH','IT','CIVIL'])[(i%6)+1], (i%4)+1 FROM generate_series(1,30) i;
INSERT INTO judge(user_id, specialization)
SELECT 37+i, (ARRAY['Artificial Intelligence','Software Engineering','Robotics','Entrepreneurship','Cultural Arts'])[i] FROM generate_series(1,5) i;
INSERT INTO volunteer(user_id, department)
SELECT 42+i, (ARRAY['CSE','ECE','IT','MECH','EEE'])[(i%5)+1] FROM generate_series(1,10) i;

INSERT INTO event_type(type_name, description) VALUES
 ('Workshop','Hands-on guided session'),('Hackathon','Timed team build event'),('Competition','Judged contest'),
 ('Seminar','Talk or lecture'),('Cultural Event','Performances and festivals');

INSERT INTO venue(venue_name, building, floor, capacity, venue_type, status) VALUES
 ('Main Auditorium','Academic Block',0,300,'Auditorium','AVAILABLE'),
 ('Seminar Hall A','Academic Block',1,120,'Seminar Hall','AVAILABLE'),
 ('Seminar Hall B','Academic Block',1,80,'Seminar Hall','AVAILABLE'),
 ('Computer Lab 1','Tech Block',2,40,'Lab','AVAILABLE'),
 ('Computer Lab 2','Tech Block',2,40,'Lab','AVAILABLE'),
 ('Open Air Theatre','Campus Grounds',0,500,'Outdoor','AVAILABLE'),
 ('Conference Room','Admin Block',3,25,'Meeting Room','AVAILABLE'),
 ('Innovation Lab','Tech Block',3,60,'Lab','MAINTENANCE');

INSERT INTO event(event_name, description, event_type_id, organizer_id, max_participants, duration_minutes, registration_deadline, status)
SELECT n, d, t, o, m, dur, current_date + dl, st FROM (VALUES
 ('Python Bootcamp','Beginner friendly Python workshop',1,3,40,180,-25,'OPEN'),
 ('Inter-College Hackathon Qualifier','Qualifying round for the AI Hackathon',2,4,60,240,-22,'OPEN'),
 ('Cultural Night 2026','Music, dance and drama showcase',5,5,200,180,-15,'OPEN'),
 ('Quiz Championship','Campus-wide general knowledge quiz',3,6,40,120,-12,'OPEN'),
 ('AI Hackathon Finals','Finals for qualified teams',2,4,40,480,2,'OPEN'),
 ('Cloud Computing Seminar','Industry talk on cloud architecture',4,7,100,90,1,'OPEN'),
 ('Web Development Workshop','React and Node in one day',1,3,40,180,2,'OPEN'),
 ('Robotics Competition','Line-follower and sumo bots',3,6,40,240,4,'OPEN'),
 ('Cybersecurity Workshop','CTF basics and secure coding',1,3,40,180,5,'OPEN'),
 ('Annual Tech Symposium','Keynotes and paper presentations',4,7,250,300,6,'OPEN'),
 ('Data Science Workshop','Pandas, plots and models',1,3,40,120,4,'OPEN'),
 ('Startup Pitch Competition','Pitch your idea to judges',3,5,50,180,4,'OPEN'),
 ('Open Mic Evening','Poetry, music and stand-up',5,5,100,120,3,'OPEN'),
 ('Career Guidance Seminar','Placement preparation talk',4,7,30,60,3,'OPEN'),
 ('Game Dev Jam','Build a game in six hours',2,4,30,360,1,'DRAFT')
) AS x(n,d,t,o,m,dur,dl,st);

INSERT INTO event_dependency(event_id, prerequisite_event_id, dependency_type) VALUES (5,2,'MUST_COMPLETE_BEFORE'),(14,6,'MUST_COMPLETE_BEFORE');

-- Registrations (event, first participant, last participant). Event 13 uses a disjoint pool; event 14 is over the Conference Room capacity.
INSERT INTO registration(event_id, participant_id, registration_date)
SELECT e.event_id, p, e.registration_deadline - interval '1 day'
FROM event e JOIN (VALUES (1,1,20),(2,1,25),(3,1,20),(4,1,18),(5,1,22),(6,1,20),(7,1,15),(8,1,18),
                          (9,1,15),(10,1,25),(11,1,12),(12,1,16),(13,26,30),(14,1,28)) c(eid,lo,hi) ON c.eid = e.event_id,
     generate_series(c.lo, c.hi) p;

INSERT INTO resource(resource_name, resource_type, total_quantity, available_quantity) VALUES
 ('Projector','Display',3,3),('Laptop','Computing',20,20),('Microphone','Audio',8,8),('Camera','Video',4,4),
 ('Speaker','Audio',6,6),('Whiteboard','Furniture',5,5),('Extension Board','Electrical',15,15),
 ('Wireless Presenter','Accessory',4,4),('Podium','Furniture',2,2),('WiFi Router','Network',3,3),('Banner Stand','Furniture',10,10);

-- Past events (inserted directly, already completed)
INSERT INTO event_schedule(event_id, venue_id, start_time, end_time, status) VALUES
 (1,4,current_date-20+time '10:00',current_date-20+time '13:00','COMPLETED'),
 (2,1,current_date-15+time '09:00',current_date-15+time '13:00','COMPLETED'),
 (3,6,current_date-10+time '17:00',current_date-10+time '20:00','COMPLETED'),
 (4,3,current_date-8+time '14:00',current_date-8+time '16:00','COMPLETED');
INSERT INTO judge_assignment(judge_id, event_id, schedule_id) VALUES (1,2,2),(2,2,2),(5,3,3),(3,4,4);
INSERT INTO volunteer_assignment(volunteer_id, event_id, schedule_id, responsibility) VALUES
 (1,2,2,'Registration desk'),(2,2,2,'Logistics'),(3,3,3,'Stage management'),(4,3,3,'Ushering');
INSERT INTO resource_allocation(resource_id, event_id, schedule_id, quantity) VALUES (2,2,2,10),(1,2,2,2),(5,3,3,4);
UPDATE event SET status = 'COMPLETED' WHERE event_id IN (1,2,3,4);

-- Upcoming events: scheduled through schedule_event(), the same path the API uses
SELECT schedule_event(5,1,current_date+6+time '09:00',ARRAY[1,2],
  '[{"volunteer_id":1,"responsibility":"Registration desk"},{"volunteer_id":2,"responsibility":"Logistics"},{"volunteer_id":3,"responsibility":"Floor support"}]',
  '[{"resource_id":1,"quantity":2},{"resource_id":3,"quantity":4},{"resource_id":5,"quantity":2}]');
SELECT schedule_event(6,2,current_date+4+time '11:00',ARRAY[]::int[],
  '[{"volunteer_id":4,"responsibility":"Hall coordination"}]','[{"resource_id":1,"quantity":1},{"resource_id":3,"quantity":1}]');
SELECT schedule_event(7,4,current_date+5+time '10:00',ARRAY[]::int[],
  '[{"volunteer_id":10,"responsibility":"Lab assistance"}]','[{"resource_id":7,"quantity":4}]');
SELECT schedule_event(8,3,current_date+7+time '10:00',ARRAY[3,4],
  '[{"volunteer_id":5,"responsibility":"Arena setup"},{"volunteer_id":6,"responsibility":"Scorekeeping"}]','[{"resource_id":4,"quantity":2},{"resource_id":5,"quantity":2}]');
SELECT schedule_event(9,5,current_date+8+time '10:00',ARRAY[]::int[],
  '[{"volunteer_id":10,"responsibility":"Lab assistance"}]','[{"resource_id":2,"quantity":15}]');
SELECT schedule_event(10,1,current_date+10+time '10:00',ARRAY[5,1],
  '[{"volunteer_id":7,"responsibility":"Registration desk"},{"volunteer_id":8,"responsibility":"Guest hosting"},{"volunteer_id":9,"responsibility":"Logistics"}]',
  '[{"resource_id":1,"quantity":2},{"resource_id":4,"quantity":2},{"resource_id":3,"quantity":4}]');

INSERT INTO attendance(event_id, participant_id, check_in_time, attendance_status)
SELECT r.event_id, r.participant_id,
  CASE WHEN r.participant_id%7=0 THEN NULL WHEN r.participant_id%5=0 THEN s.start_time + interval '15 min' ELSE s.start_time + interval '2 min' END,
  CASE WHEN r.participant_id%7=0 THEN 'ABSENT' WHEN r.participant_id%5=0 THEN 'LATE' ELSE 'PRESENT' END
FROM registration r JOIN event_schedule s ON s.event_id = r.event_id WHERE r.event_id IN (1,2,3,4);

INSERT INTO event_result(event_id, participant_id, position, score, remarks)
SELECT event_id, participant_id, rn, 98 - rn*6 - (event_id % 3), CASE WHEN rn = 1 THEN 'Winner' END
FROM (SELECT a.event_id, a.participant_id,
             row_number() OVER (PARTITION BY a.event_id ORDER BY (a.participant_id*7 % 11), a.participant_id) AS rn
      FROM attendance a WHERE a.event_id IN (2,4) AND a.attendance_status = 'PRESENT') t WHERE rn <= 5;

INSERT INTO scheduling_conflict_log(event_id, attempted_by, venue_id, attempted_start, attempted_end, conflict_type, message, logged_at) VALUES
 (12,5,2,current_date+4+time '11:00',current_date+4+time '14:00','VENUE','Seminar Hall A is already booked by: Cloud Computing Seminar',now()-interval '2 days'),
 (11,3,3,current_date+7+time '11:00',current_date+7+time '13:00','PARTICIPANT','12 participant(s) clash with: Robotics Competition',now()-interval '1 day'),
 (13,5,1,current_date+6+time '10:00',current_date+6+time '12:00','RESOURCE','Resource shortage: Projector (requested 2, total 3)',now()-interval '3 hours');
