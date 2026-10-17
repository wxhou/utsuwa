use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;

pub const RESIDENT_STATE_FILE: &str = "resident-state.json";

// Snapshot pushed from the webview. Times are epoch ms; quiet hours and the
// schedule use local wall-time rendered from the JS-reported UTC offset, so
// the scheduler stays time-zone free.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ScheduleSnapshot {
    pub version: u64,
    pub reminders: Vec<ReminderEntry>,
    pub checkin: CheckinConfig,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ReminderEntry {
    pub key: String,
    pub trigger_at: u64,
    pub title: String,
    pub body: String,
    pub session_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CheckinConfig {
    pub enabled: bool,
    pub paused: bool,
    pub max_per_day: u32,
    pub quiet_start_min: u16,
    pub quiet_end_min: u16,
    pub quiet_enabled: bool,
    pub tz_offset_min: i32,
}

impl Default for CheckinConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            paused: false,
            max_per_day: 3,
            quiet_start_min: 23 * 60,
            quiet_end_min: 9 * 60,
            quiet_enabled: true,
            tz_offset_min: 0,
        }
    }
}

pub struct SchedulerState {
    pub snapshot: ScheduleSnapshot,
    // Composite "key@triggerAt" strings so a recurring reminder re-pushed with
    // a new trigger time fires again, while an idempotent re-push from the
    // other window does not re-fire.
    pub fired: HashSet<String>,
    pub slots: Vec<u64>,
    pub fired_slots: HashSet<u64>,
    pub day_key: Option<String>,
    // Which (day, checkin config) produced the current slots, so a mid-day
    // enable or a budget/quiet edit re-arms the day's remaining slots without
    // re-waking already-released ones.
    pub slots_signature: Option<(String, CheckinConfig)>,
    pub last_activity_ms: u64,
}

impl Default for SchedulerState {
    fn default() -> Self {
        Self {
            snapshot: ScheduleSnapshot::default(),
            fired: HashSet::new(),
            slots: Vec::new(),
            fired_slots: HashSet::new(),
            day_key: None,
            slots_signature: None,
            last_activity_ms: 0,
        }
    }
}

// Daily counter persisted across restarts so an app relaunch cannot reset the
// proactive budget mid-day.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ResidentPersist {
    pub day: String,
    pub checkins_sent: u32,
    pub hide_explained: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickOutcome {
    pub reminder_fires: Vec<ReminderEntry>,
    pub checkin_wakes: Vec<u64>,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn local_day_index(epoch_ms: u64, tz_offset_min: i32) -> i64 {
    epoch_ms as i64 + i64::from(tz_offset_min) * 60_000
}

pub fn local_day_bounds(day_index: i64, tz_offset_min: i32) -> (u64, u64) {
    let start = day_index * 86_400_000 - i64::from(tz_offset_min) * 60_000;
    (start as u64, (start + 86_400_000) as u64)
}

pub fn day_key_of(epoch_ms: u64, tz_offset_min: i32) -> String {
    let local_days = local_day_index(epoch_ms, tz_offset_min).div_euclid(86_400_000);
    let (y, m, d) = civil_from_days(local_days);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Civil-from-days (Howard Hinnant's algorithm) — no chrono dep needed.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn minutes_of_day(epoch_ms: u64, tz_offset_min: i32) -> u32 {
    let day_secs = local_day_index(epoch_ms, tz_offset_min).rem_euclid(86_400_000) / 1000;
    (day_secs / 60) as u32
}

pub fn in_quiet(minutes: u32, quiet: Option<(u16, u16)>) -> bool {
    let Some((start, end)) = quiet else {
        return false;
    };
    let (start, end) = (u32::from(start), u32::from(end));
    if start == end {
        return false;
    }
    // A start past the end wraps across midnight (23:00 -> 9:00).
    if start < end {
        minutes >= start && minutes < end
    } else {
        minutes >= start || minutes < end
    }
}

fn splitmix64(seed: u64) -> impl FnMut() -> u64 {
    let mut x = seed;
    move || {
        x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = x;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

/// Deterministic daily slots: `count` times within the local day, dropping
/// those that land in the quiet window. Seeded from the day index, so a
/// restart mid-day regenerates the identical (remaining) slots.
pub fn generate_slots(
    day_start_ms: u64,
    day_end_ms: u64,
    tz_offset_min: i32,
    quiet: Option<(u16, u16)>,
    count: usize,
) -> Vec<u64> {
    if count == 0 || day_end_ms <= day_start_ms {
        return Vec::new();
    }
    let span = day_end_ms - day_start_ms;
    let mut rng = splitmix64(day_start_ms.wrapping_mul(2_654_435_761));
    let mut picked: Vec<u64> = Vec::with_capacity(count);
    let mut guard = 0;
    while picked.len() < count && guard < count * 20 + 50 {
        guard += 1;
        let t = day_start_ms + rng() % span;
        if in_quiet(minutes_of_day(t, tz_offset_min), quiet) {
            continue;
        }
        picked.push(t);
    }
    picked.sort_unstable();
    picked.dedup();
    picked.truncate(count);
    picked
}

fn fire_key(r: &ReminderEntry) -> String {
    format!("{}@{}", r.key, r.trigger_at)
}

/// Snapshot replacement: newer-or-equal versions win, older ones are rejected.
/// Re-pushing (same version, the other window's idempotent push) is allowed.
pub fn snapshot_supersedes(old_version: u64, new_version: u64) -> bool {
    new_version >= old_version
}

pub fn apply_snapshot(state: &mut SchedulerState, snap: ScheduleSnapshot) -> bool {
    if !snapshot_supersedes(state.snapshot.version, snap.version) {
        return false;
    }
    let current_keys: HashSet<String> = snap.reminders.iter().map(|r| r.key.clone()).collect();
    state.fired.retain(|k| {
        k.split_once('@')
            .is_some_and(|(key, _)| current_keys.contains(key))
    });
    state.snapshot = snap;
    true
}

pub fn clear_pending_checkins(state: &mut SchedulerState) {
    state.slots.clear();
    state.fired_slots.clear();
    state.day_key = None;
    state.slots_signature = None;
}

/// Daily counter rolls over at the local day boundary; otherwise it stays, so
/// a restart mid-day cannot reset the proactive budget.
pub fn rolled_count(persisted: &ResidentPersist, today: &str) -> u32 {
    if persisted.day == today {
        persisted.checkins_sent
    } else {
        0
    }
}

pub fn gate_passed(count: u32, cfg: &CheckinConfig, epoch_ms: u64) -> bool {
    if !cfg.enabled || cfg.paused {
        return false;
    }
    if count >= cfg.max_per_day {
        return false;
    }
    let quiet = if cfg.quiet_enabled {
        Some((cfg.quiet_start_min, cfg.quiet_end_min))
    } else {
        None
    };
    !in_quiet(minutes_of_day(epoch_ms, cfg.tz_offset_min), quiet)
}

/// One scheduler tick: fire due reminders, release due check-in slots that
/// pass the hard gate. Mutates fired-marks and slot state; callers deliver
/// `TickOutcome` (notifications, event emissions) and increment the persisted
/// count only when a check-in is actually sent.
pub fn tick(state: &mut SchedulerState, sent_today: u32, now: u64) -> TickOutcome {
    let cfg = state.snapshot.checkin.clone();
    let tz = cfg.tz_offset_min;
    let today = day_key_of(now, tz);
    if state.day_key.as_deref() != Some(today.as_str()) {
        state.day_key = Some(today.clone());
        state.fired_slots.clear();
    }
    // Slots regenerate when the day rolls over or the config that produces
    // them changes (enable flip, budget/quiet edit) — a module enabled mid-day
    // must still reach the day's remaining slots. Already-released slots stay
    // consumed; suppressed ones are not compensated.
    let slot_count = if cfg.enabled { cfg.max_per_day * 2 } else { 0 };
    let wanted = if slot_count == 0 {
        None
    } else {
        Some((today.clone(), cfg.clone()))
    };
    if state.slots_signature != wanted {
        state.slots_signature = wanted;
        if slot_count == 0 {
            state.slots.clear();
        } else {
            let quiet = if cfg.quiet_enabled {
                Some((cfg.quiet_start_min, cfg.quiet_end_min))
            } else {
                None
            };
            let (start, end) =
                local_day_bounds(local_day_index(now, tz).div_euclid(86_400_000), tz);
            let mut fresh = generate_slots(start, end, tz, quiet, slot_count as usize);
            fresh.retain(|s| !state.fired_slots.contains(s));
            state.slots = fresh;
        }
    }

    let mut out = TickOutcome::default();
    for r in &state.snapshot.reminders {
        let key = fire_key(r);
        if r.trigger_at <= now && !state.fired.contains(&key) {
            state.fired.insert(key);
            out.reminder_fires.push(r.clone());
        }
    }
    // At most one check-in wake per tick so overdue slots release one by one.
    if let Some(next) = state.slots.first().copied() {
        if next <= now {
            state.slots.remove(0);
            state.fired_slots.insert(next);
            if gate_passed(sent_today, &cfg, now) {
                out.checkin_wakes.push(next);
            }
        }
    }
    out
}

pub fn load_persist(data_dir: &PathBuf) -> ResidentPersist {
    std::fs::read_to_string(data_dir.join(RESIDENT_STATE_FILE))
        .ok()
        .and_then(|text| serde_json::from_str::<ResidentPersist>(&text).ok())
        .unwrap_or_default()
}

pub fn save_persist(data_dir: &PathBuf, persist: &ResidentPersist) -> Result<(), String> {
    let path = data_dir.join(RESIDENT_STATE_FILE);
    let json = serde_json::to_string(persist).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-10-16T00:00:00Z (day index 20742 since epoch).
    const DAY0: u64 = 1_792_108_800_000;

    #[test]
    fn quiet_window_wraps_midnight() {
        assert!(in_quiet(23 * 60 + 30, Some((23 * 60, 9 * 60)))); // 23:30
        assert!(in_quiet(5 * 60, Some((23 * 60, 9 * 60)))); // 05:00
        assert!(!in_quiet(9 * 60, Some((23 * 60, 9 * 60)))); // end exclusive
        assert!(!in_quiet(22 * 60 + 59, Some((23 * 60, 9 * 60))));
        assert!(!in_quiet(12 * 60, Some((23 * 60, 9 * 60))));
    }

    #[test]
    fn quiet_non_wrapping_window() {
        assert!(in_quiet(14 * 60, Some((13 * 60, 15 * 60))));
        assert!(!in_quiet(12 * 60, Some((13 * 60, 15 * 60))));
        assert!(!in_quiet(15 * 60, Some((13 * 60, 15 * 60))));
    }

    #[test]
    fn quiet_disabled_means_never_quiet() {
        assert!(!in_quiet(3 * 60, None));
    }

    #[test]
    fn tz_offset_shifts_minutes_of_day() {
        // 23:00 UTC read in UTC+8 is 07:00 local.
        let mins = minutes_of_day(DAY0 + 23 * 3_600_000, 480);
        assert_eq!(mins, 7 * 60);
    }

    #[test]
    fn day_key_and_bounds_follow_tz_offset() {
        // UTC 20:00 is already Oct 17 at UTC+8.
        assert_eq!(day_key_of(DAY0 + 20 * 3_600_000, 0), "2026-10-16");
        assert_eq!(day_key_of(DAY0 + 20 * 3_600_000, 480), "2026-10-17");
        let (start, end) = local_day_bounds(20742, 480);
        assert_eq!(start, DAY0 - 8 * 3_600_000); // local midnight = UTC 16:00
        assert_eq!(end - start, 86_400_000);
    }

    #[test]
    fn slots_avoid_quiet_and_are_deterministic() {
        let slots = generate_slots(DAY0, DAY0 + 86_400_000, 480, Some((23 * 60, 9 * 60)), 6);
        assert_eq!(slots.len(), 6);
        for s in &slots {
            assert!(*s >= DAY0 && *s < DAY0 + 86_400_000);
            assert!(!in_quiet(minutes_of_day(*s, 480), Some((23 * 60, 9 * 60))));
        }
        let again = generate_slots(DAY0, DAY0 + 86_400_000, 480, Some((23 * 60, 9 * 60)), 6);
        assert_eq!(slots, again);
    }

    #[test]
    fn counter_persists_within_day_and_rolls_over() {
        let persisted = ResidentPersist {
            day: "2026-10-16".into(),
            checkins_sent: 2,
            hide_explained: false,
        };
        assert_eq!(rolled_count(&persisted, "2026-10-16"), 2);
        assert_eq!(rolled_count(&persisted, "2026-10-17"), 0);
    }

    #[test]
    fn gate_rejects_each_violation() {
        let base = CheckinConfig::default();
        assert!(!gate_passed(0, &base, DAY0 + 43_200_000)); // disabled by default
        let on = CheckinConfig {
            enabled: true,
            ..base.clone()
        };
        assert!(!gate_passed(
            0,
            &CheckinConfig {
                paused: true,
                ..on.clone()
            },
            DAY0 + 43_200_000
        ));
        assert!(!gate_passed(3, &on, DAY0 + 43_200_000)); // budget exhausted
        assert!(!gate_passed(0, &on, DAY0 + 3 * 3_600_000)); // inside quiet
        assert!(gate_passed(0, &on, DAY0 + 43_200_000)); // 12:00 local ok
        let open = CheckinConfig {
            quiet_enabled: false,
            ..on
        };
        assert!(gate_passed(0, &open, DAY0 + 3 * 3_600_000)); // quiet off -> night allowed
    }

    fn reminder(key: &str, at: u64) -> ReminderEntry {
        ReminderEntry {
            key: key.into(),
            trigger_at: at,
            title: "t".into(),
            body: "b".into(),
            session_id: Some(1),
        }
    }

    #[test]
    fn tick_fires_due_reminder_exactly_once() {
        let mut state = SchedulerState::default();
        let mut snap = ScheduleSnapshot {
            version: 1,
            ..Default::default()
        };
        snap.reminders = vec![reminder("12", DAY0 + 6_000)];
        snap.checkin = CheckinConfig::default();
        assert!(apply_snapshot(&mut state, snap));

        let out = tick(&mut state, 0, DAY0 + 6_000);
        assert_eq!(out.reminder_fires.len(), 1);
        assert_eq!(out.reminder_fires[0].key, "12");
        assert!(out.checkin_wakes.is_empty());

        let out = tick(&mut state, 0, DAY0 + 7_000);
        assert!(out.reminder_fires.is_empty());
    }

    #[test]
    fn idempotent_repush_does_not_refire() {
        let mut state = SchedulerState::default();
        let snap = ScheduleSnapshot {
            version: 2,
            reminders: vec![reminder("7", DAY0 + 1_000)],
            checkin: CheckinConfig::default(),
        };
        assert!(apply_snapshot(&mut state, snap));
        tick(&mut state, 0, DAY0 + 2_000);

        // Same-version re-push from the other window.
        let again = ScheduleSnapshot {
            version: 2,
            reminders: vec![reminder("7", DAY0 + 1_000)],
            checkin: CheckinConfig::default(),
        };
        assert!(apply_snapshot(&mut state, again));
        let out = tick(&mut state, 0, DAY0 + 3_000);
        assert!(out.reminder_fires.is_empty());
    }

    #[test]
    fn newer_snapshot_supersedes_old_timers() {
        let mut state = SchedulerState::default();
        let old = ScheduleSnapshot {
            version: 1,
            reminders: vec![reminder("12", DAY0 + 1_000)],
            checkin: CheckinConfig::default(),
        };
        assert!(apply_snapshot(&mut state, old));
        // v2 arrives before the old timer's due time and drops it.
        let new = ScheduleSnapshot {
            version: 2,
            reminders: vec![reminder("13", DAY0 + 9_000)],
            checkin: CheckinConfig::default(),
        };
        assert!(apply_snapshot(&mut state, new));
        let out = tick(&mut state, 0, DAY0 + 2_000); // old "12" due time passed
        assert!(out.reminder_fires.is_empty());
        let out = tick(&mut state, 0, DAY0 + 9_000);
        assert_eq!(out.reminder_fires[0].key, "13");
    }

    #[test]
    fn stale_version_push_is_rejected() {
        let mut state = SchedulerState::default();
        let v3 = ScheduleSnapshot {
            version: 3,
            reminders: vec![reminder("12", DAY0 + 1_000)],
            checkin: CheckinConfig::default(),
        };
        assert!(apply_snapshot(&mut state, v3));
        let v2 = ScheduleSnapshot {
            version: 2,
            reminders: vec![reminder("99", DAY0 + 5_000)],
            checkin: CheckinConfig::default(),
        };
        assert!(!apply_snapshot(&mut state, v2));
        assert!(state.snapshot.reminders.iter().all(|r| r.key == "12"));
        assert_eq!(state.snapshot.version, 3);
    }

    #[test]
    fn slot_wakes_pass_hard_gate_and_budget() {
        let mut state = SchedulerState::default();
        let mut snap = ScheduleSnapshot {
            version: 1,
            ..Default::default()
        };
        snap.checkin = CheckinConfig {
            enabled: true,
            paused: false,
            max_per_day: 1,
            quiet_start_min: 23 * 60,
            quiet_end_min: 9 * 60,
            quiet_enabled: true,
            tz_offset_min: 0,
        };
        assert!(apply_snapshot(&mut state, snap));

        // First released wake passes the gate (one per tick).
        let out = tick(&mut state, 0, DAY0 + 20 * 3_600_000);
        assert_eq!(out.checkin_wakes.len(), 1);
        // Budget spent (max_per_day = 1): further wakes are suppressed.
        let out = tick(&mut state, 1, DAY0 + 21 * 3_600_000);
        assert!(out.checkin_wakes.is_empty());
    }

    #[test]
    fn clear_pending_checkins_stops_queued_slots() {
        let mut state = SchedulerState::default();
        let mut snap = ScheduleSnapshot {
            version: 1,
            ..Default::default()
        };
        snap.checkin = CheckinConfig {
            enabled: true,
            ..CheckinConfig::default()
        };
        assert!(apply_snapshot(&mut state, snap));
        tick(&mut state, 0, DAY0 + 43_200_000);
        assert!(!state.slots.is_empty() || !state.fired_slots.is_empty());

        clear_pending_checkins(&mut state);
        assert!(state.slots.is_empty());
        // Next tick regenerates for the still-running day and releases again.
        let out = tick(&mut state, 0, DAY0 + 43_201_000);
        assert_eq!(out.checkin_wakes.len(), 1);
    }

    #[test]
    fn enable_mid_day_still_reaches_the_days_remaining_slots() {
        // Boot with the module off: the day arms but no slots materialize.
        let mut state = SchedulerState::default();
        let off = ScheduleSnapshot {
            version: 1,
            ..Default::default()
        };
        assert!(apply_snapshot(&mut state, off));
        let out = tick(&mut state, 0, DAY0 + 18 * 3_600_000);
        assert!(out.checkin_wakes.is_empty());
        assert!(state.slots.is_empty());

        // Enabling mid-day: the day's remaining slots arm, and every past-due
        // one releases one per tick — but only once, even across later
        // idempotent re-pushes.
        let mut on = ScheduleSnapshot {
            version: 2,
            ..Default::default()
        };
        on.checkin = CheckinConfig {
            enabled: true,
            ..CheckinConfig::default()
        };
        assert!(apply_snapshot(&mut state, on));

        let (start, end) = local_day_bounds(
            local_day_index(DAY0 + 18 * 3_600_000, 0).div_euclid(86_400_000),
            0,
        );
        let due_wake = generate_slots(start, end, 0, Some((23 * 60, 9 * 60)), 6)
            .into_iter()
            .filter(|s| *s <= DAY0 + 18 * 3_600_000)
            .count();

        let mut released = 0;
        let mut now = DAY0 + 18 * 3_600_000;
        for _ in 0..(due_wake + 3) {
            released += tick(&mut state, 0, now).checkin_wakes.len();
            now += 500;
        }
        assert_eq!(released as usize, due_wake);
    }

    #[test]
    fn persist_roundtrip() {
        let dir = std::env::temp_dir().join(format!("utsuwa-sched-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let persist = ResidentPersist {
            day: "2026-10-16".into(),
            checkins_sent: 3,
            hide_explained: true,
        };
        save_persist(&dir, &persist).unwrap();
        assert_eq!(load_persist(&dir), persist);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn serde_camel_case_roundtrip() {
        let snap = ScheduleSnapshot {
            version: 4,
            reminders: vec![reminder("12", DAY0 + 6_000)],
            checkin: CheckinConfig::default(),
        };
        let text = serde_json::to_string(&snap).unwrap();
        assert!(text.contains("\"triggerAt\""));
        assert!(text.contains("\"maxPerDay\""));
        assert_eq!(
            serde_json::from_str::<ScheduleSnapshot>(&text).unwrap(),
            snap
        );
    }
}
