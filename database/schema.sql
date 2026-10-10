-- =====================================================================
-- Event Management & Dynamic Scheduling System  |  schema.sql (Phase 2)
-- PostgreSQL 14+ (Neon). Re-runnable: drops and recreates all tables.
-- =====================================================================

-- btree_gist lets a GiST index/EXCLUDE constraint combine equality on a
-- plain column (venue_id WITH =) with range overlap (WITH &&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP TABLE IF EXISTS
  scheduling_conflict_log, event_dependency, attendance, event_result,
  resource_allocation, resource, volunteer_assignment, volunteer,
  judge_assignment, judge, event_schedule, venue, registration,
  participant, event, event_type, users
CASCADE;

-- ---------------------------------------------------------------------
-- 1. USERS
-- ---------------------------------------------------------------------
CREATE TABLE users (
  user_id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  phone         VARCHAR(20),
  password_hash TEXT         NOT NULL,
  role          TEXT         NOT NULL
                CHECK (role IN ('ADMIN','ORGANIZER','PARTICIPANT','JUDGE','VOLUNTEER')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT users_email_format CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- ---------------------------------------------------------------------
-- 2. EVENT_TYPE
-- ---------------------------------------------------------------------
CREATE TABLE event_type (
  event_type_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_name     VARCHAR(60) NOT NULL UNIQUE,
  description   TEXT
);

-- ---------------------------------------------------------------------
-- 3. EVENT
-- ---------------------------------------------------------------------
CREATE TABLE event (
  event_id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name            VARCHAR(150) NOT NULL,
  description           TEXT,
  event_type_id         INT NOT NULL REFERENCES event_type(event_type_id),
  organizer_id          INT NOT NULL REFERENCES users(user_id),
  max_participants      INT NOT NULL CHECK (max_participants > 0),
  duration_minutes      INT NOT NULL CHECK (duration_minutes > 0),
  registration_deadline TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','OPEN','SCHEDULED','ONGOING','COMPLETED','CANCELLED')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 4. PARTICIPANT
-- ---------------------------------------------------------------------
CREATE TABLE participant (
  participant_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,  -- 1:0..1
  registration_number VARCHAR(30) NOT NULL UNIQUE,
  department          VARCHAR(80) NOT NULL,
  year                SMALLINT NOT NULL CHECK (year BETWEEN 1 AND 6)
);

-- ---------------------------------------------------------------------
-- 5. REGISTRATION  (junction EVENT <-> PARTICIPANT)
-- ---------------------------------------------------------------------
CREATE TABLE registration (
  registration_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id          INT NOT NULL REFERENCES event(event_id)             ON DELETE CASCADE,
  participant_id    INT NOT NULL REFERENCES participant(participant_id) ON DELETE CASCADE,
  registration_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'REGISTERED'
                    CHECK (status IN ('REGISTERED','WAITLISTED','CANCELLED')),
  -- A participant cannot register for the same event twice. This key is also
  -- the target of the composite FKs from attendance and event_result.
  CONSTRAINT registration_event_participant_uq UNIQUE (event_id, participant_id)
);

-- ---------------------------------------------------------------------
-- 6. VENUE
-- ---------------------------------------------------------------------
CREATE TABLE venue (
  venue_id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  venue_name VARCHAR(100) NOT NULL UNIQUE,
  building   VARCHAR(100) NOT NULL,
  floor      SMALLINT NOT NULL DEFAULT 0,
  capacity   INT NOT NULL CHECK (capacity > 0),
  venue_type VARCHAR(40) NOT NULL,
  status     TEXT NOT NULL DEFAULT 'AVAILABLE'
             CHECK (status IN ('AVAILABLE','MAINTENANCE','CLOSED'))
);

-- ---------------------------------------------------------------------
-- 7. EVENT_SCHEDULE  (core table)
-- An event may have several sessions (1:N); a venue hosts many schedules.
-- ---------------------------------------------------------------------
CREATE TABLE event_schedule (
  schedule_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    INT NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
  venue_id    INT NOT NULL REFERENCES venue(venue_id),
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'SCHEDULED'
              CHECK (status IN ('SCHEDULED','ONGOING','COMPLETED','CANCELLED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT schedule_time_valid CHECK (end_time > start_time),

  -- Target for composite FKs: guarantees assignment.event_id always agrees
  -- with the event that owns assignment.schedule_id (removes the
  -- schedule_id -> event_id transitive redundancy as an anomaly risk).
  CONSTRAINT schedule_id_event_uq UNIQUE (schedule_id, event_id),

  -- VENUE CONFLICT, enforced by the database itself (race-condition safe):
  -- two non-cancelled schedules in the same venue may not have overlapping
  -- half-open ranges [start, end). Back-to-back events (12:00 end / 12:00
  -- start) are allowed; a cancelled schedule frees the slot.
  CONSTRAINT no_venue_overlap EXCLUDE USING gist (
    venue_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status <> 'CANCELLED')
);

-- ---------------------------------------------------------------------
-- 8-9. JUDGE, JUDGE_ASSIGNMENT
-- ---------------------------------------------------------------------
CREATE TABLE judge (
  judge_id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  specialization      VARCHAR(100) NOT NULL,
  availability_status TEXT NOT NULL DEFAULT 'AVAILABLE'
                      CHECK (availability_status IN ('AVAILABLE','UNAVAILABLE'))
);

CREATE TABLE judge_assignment (
  assignment_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  judge_id      INT NOT NULL REFERENCES judge(judge_id) ON DELETE CASCADE,
  event_id      INT NOT NULL,
  schedule_id   INT NOT NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT judge_assignment_uq UNIQUE (judge_id, schedule_id),
  CONSTRAINT judge_assignment_schedule_fk FOREIGN KEY (schedule_id, event_id)
    REFERENCES event_schedule (schedule_id, event_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 10-11. VOLUNTEER, VOLUNTEER_ASSIGNMENT
-- ---------------------------------------------------------------------
CREATE TABLE volunteer (
  volunteer_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  department          VARCHAR(80) NOT NULL,
  availability_status TEXT NOT NULL DEFAULT 'AVAILABLE'
                      CHECK (availability_status IN ('AVAILABLE','UNAVAILABLE'))
);

CREATE TABLE volunteer_assignment (
  assignment_id  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  volunteer_id   INT NOT NULL REFERENCES volunteer(volunteer_id) ON DELETE CASCADE,
  event_id       INT NOT NULL,
  schedule_id    INT NOT NULL,
  responsibility VARCHAR(120) NOT NULL,
  CONSTRAINT volunteer_assignment_uq UNIQUE (volunteer_id, schedule_id),
  CONSTRAINT volunteer_assignment_schedule_fk FOREIGN KEY (schedule_id, event_id)
    REFERENCES event_schedule (schedule_id, event_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 12-13. RESOURCE, RESOURCE_ALLOCATION
-- available_quantity = total_quantity minus units held by schedules that are
-- ONGOING right now. It is maintained by triggers (triggers.sql). Time-window
-- conflicts are decided by check_resource_availability(), not by this column.
-- ---------------------------------------------------------------------
CREATE TABLE resource (
  resource_id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_name      VARCHAR(100) NOT NULL UNIQUE,
  resource_type      VARCHAR(50)  NOT NULL,
  total_quantity     INT NOT NULL CHECK (total_quantity >= 0),
  available_quantity INT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE','MAINTENANCE','RETIRED')),
  CONSTRAINT resource_available_range CHECK (available_quantity BETWEEN 0 AND total_quantity)
);

CREATE TABLE resource_allocation (
  allocation_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_id   INT NOT NULL REFERENCES resource(resource_id),
  event_id      INT NOT NULL,
  schedule_id   INT NOT NULL,
  quantity      INT NOT NULL CHECK (quantity > 0),
  allocated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT resource_allocation_uq UNIQUE (resource_id, schedule_id),
  CONSTRAINT resource_allocation_schedule_fk FOREIGN KEY (schedule_id, event_id)
    REFERENCES event_schedule (schedule_id, event_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 14-15. EVENT_RESULT, ATTENDANCE (only for people who actually registered)
-- ---------------------------------------------------------------------
CREATE TABLE event_result (
  result_id      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id       INT NOT NULL,
  participant_id INT NOT NULL,
  position       INT CHECK (position > 0),
  score          NUMERIC(6,2) CHECK (score >= 0),
  remarks        TEXT,
  CONSTRAINT event_result_uq UNIQUE (event_id, participant_id),
  CONSTRAINT event_result_registration_fk FOREIGN KEY (event_id, participant_id)
    REFERENCES registration (event_id, participant_id) ON DELETE CASCADE
);

CREATE TABLE attendance (
  attendance_id     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id          INT NOT NULL,
  participant_id    INT NOT NULL,
  check_in_time     TIMESTAMPTZ,
  check_out_time    TIMESTAMPTZ,
  attendance_status TEXT NOT NULL DEFAULT 'PRESENT'
                    CHECK (attendance_status IN ('PRESENT','ABSENT','LATE')),
  CONSTRAINT attendance_uq UNIQUE (event_id, participant_id),
  CONSTRAINT attendance_times_valid CHECK (check_out_time IS NULL OR check_in_time IS NULL
                                           OR check_out_time >= check_in_time),
  CONSTRAINT attendance_registration_fk FOREIGN KEY (event_id, participant_id)
    REFERENCES registration (event_id, participant_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 16. EVENT_DEPENDENCY (self-referencing M:N on EVENT)
-- Cycle prevention is done in triggers.sql (a CHECK cannot look at other rows).
-- ---------------------------------------------------------------------
CREATE TABLE event_dependency (
  dependency_id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id              INT NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
  prerequisite_event_id INT NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
  dependency_type       TEXT NOT NULL DEFAULT 'MUST_COMPLETE_BEFORE'
                        CHECK (dependency_type IN ('MUST_COMPLETE_BEFORE','MUST_START_AFTER')),
  CONSTRAINT event_dependency_uq UNIQUE (event_id, prerequisite_event_id),
  CONSTRAINT event_dependency_not_self CHECK (event_id <> prerequisite_event_id)
);

-- ---------------------------------------------------------------------
-- 17. SCHEDULING_CONFLICT_LOG
-- Written by the backend AFTER a scheduling transaction rolls back (a rolled
-- back transaction cannot log its own failure). Feeds the dashboard card.
-- ---------------------------------------------------------------------
CREATE TABLE scheduling_conflict_log (
  log_id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id        INT REFERENCES event(event_id) ON DELETE CASCADE,
  attempted_by    INT REFERENCES users(user_id)  ON DELETE SET NULL,
  venue_id        INT REFERENCES venue(venue_id) ON DELETE SET NULL,
  attempted_start TIMESTAMPTZ,
  attempted_end   TIMESTAMPTZ,
  conflict_type   TEXT NOT NULL
                  CHECK (conflict_type IN ('VENUE','CAPACITY','PARTICIPANT','JUDGE','VOLUNTEER',
                                           'RESOURCE','DEPENDENCY','DEADLINE','STATUS','OTHER')),
  message         TEXT NOT NULL,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
