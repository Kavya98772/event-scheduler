-- indexes.sql | PostgreSQL does not index FK columns automatically. UNIQUE constraints already
-- provide indexes on (event_id,participant_id), (judge_id,schedule_id), (volunteer_id,schedule_id),
-- (resource_id,schedule_id) and the GiST index behind no_venue_overlap, so those are NOT duplicated.
CREATE INDEX IF NOT EXISTS idx_event_status        ON event(status);                  -- dashboard/status filters
CREATE INDEX IF NOT EXISTS idx_event_organizer     ON event(organizer_id);            -- organizer's own events
CREATE INDEX IF NOT EXISTS idx_event_deadline      ON event(registration_deadline);   -- deadline checks / closing soon
CREATE INDEX IF NOT EXISTS idx_schedule_event      ON event_schedule(event_id);       -- FK join, every event page
CREATE INDEX IF NOT EXISTS idx_schedule_venue_time ON event_schedule(venue_id, start_time); -- venue calendar lookups
CREATE INDEX IF NOT EXISTS idx_schedule_start      ON event_schedule(start_time, end_time) WHERE status <> 'CANCELLED'; -- calendar window / upcoming
CREATE INDEX IF NOT EXISTS idx_registration_part   ON registration(participant_id);   -- my events, participant clash check
CREATE INDEX IF NOT EXISTS idx_judge_assign_sched  ON judge_assignment(schedule_id);  -- reverse lookup, cascade deletes
CREATE INDEX IF NOT EXISTS idx_vol_assign_sched    ON volunteer_assignment(schedule_id);
CREATE INDEX IF NOT EXISTS idx_res_alloc_sched     ON resource_allocation(schedule_id);
CREATE INDEX IF NOT EXISTS idx_conflict_log_time   ON scheduling_conflict_log(logged_at DESC); -- dashboard "recent conflicts"
