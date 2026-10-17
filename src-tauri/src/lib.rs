use serde_json::json;
use tauri::{Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use {
    tauri::menu::{Menu, MenuItem},
    tauri::tray::TrayIconBuilder,
};

#[cfg(all(
    not(target_os = "macos"),
    not(any(target_os = "android", target_os = "ios"))
))]
use tauri_plugin_notification::NotificationExt;

mod scheduler;

#[cfg(target_os = "macos")]
mod notification_macos;

const EVT_REMINDER_FIRED: &str = "resident:reminder-fired";
const EVT_CHECKIN_SLOT_WAKE: &str = "resident:checkin-slot-wake";
const EVT_CHECKIN_SENT: &str = "resident:checkin-sent";
const EVT_NOTIFICATION_ACTION: &str = "resident:notification-action";
const LOCK_POISONED: &str = "resident state lock poisoned";
/// Recorded in the notification payload and read back to tell check-in
/// notifications apart from the rest.
const KIND_CHECKIN: &str = "checkin";

/// Categories only exist where the delivery layer can register them; the plugin's
/// path has no equivalent, so there the buttons simply don't appear.
#[cfg(target_os = "macos")]
const CATEGORY_CHECKIN: Option<&str> = Some(notification_macos::CATEGORY_CHECKIN);
#[cfg(not(target_os = "macos"))]
const CATEGORY_CHECKIN: Option<&str> = None;
#[cfg(target_os = "macos")]
const CATEGORY_REMINDER: Option<&str> = Some(notification_macos::CATEGORY_REMINDER);
#[cfg(not(target_os = "macos"))]
const CATEGORY_REMINDER: Option<&str> = None;

/// Windows whose being in front means a proactive message is already where the
/// user is looking. Both are the full conversation, so either one counts.
const INTERACTIVE_WINDOWS: [&str; 2] = ["main", "overlay"];

/// How a proactive message reached the user.
#[derive(Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
enum Delivery {
    /// The system took the notification.
    Sent,
    /// A conversation window was visible and focused, so posting one would be a
    /// second interruption of something already on screen.
    Frontmost,
    /// The system refused it, or was never authorized to show it.
    Undelivered,
}

fn is_frontmost(app: &tauri::AppHandle) -> bool {
    INTERACTIVE_WINDOWS.iter().any(|label| {
        app.get_webview_window(label).is_some_and(|window| {
            matches!(
                (window.is_visible(), window.is_focused()),
                (Ok(true), Ok(true))
            )
        })
    })
}

/// The policy in front of a proactive message, applied before delivery: what is
/// already on screen does not need a banner. The tray explainer is not a proactive
/// message — it is the notice that the window just left the screen — so it calls
/// `notify_with_extras` directly.
fn deliver_proactive(
    app: &tauri::AppHandle,
    id: Option<i32>,
    title: &str,
    body: &str,
    extras: serde_json::Map<String, serde_json::Value>,
    category: Option<&str>,
) -> Delivery {
    if is_frontmost(app) {
        return Delivery::Frontmost;
    }
    notify_with_extras(app, id, title, body, extras, category)
}

/// Delivery itself: what the OS took, and whether it would take it at all.
///
/// macOS carries the payload in the request identifier, so the numeric id the
/// plugin uses for in-place replacement has no counterpart there.
#[cfg(target_os = "macos")]
fn notify_with_extras(
    _app: &tauri::AppHandle,
    _id: Option<i32>,
    title: &str,
    body: &str,
    extras: serde_json::Map<String, serde_json::Value>,
    category: Option<&str>,
) -> Delivery {
    if !notification_macos::is_authorized() {
        eprintln!("notification: not authorized");
        return Delivery::Undelivered;
    }
    match notification_macos::post(title, body, &extras, category) {
        Ok(()) => Delivery::Sent,
        Err(e) => {
            eprintln!("notification: {e}");
            Delivery::Undelivered
        }
    }
}

#[cfg(all(
    not(target_os = "macos"),
    not(any(target_os = "android", target_os = "ios"))
))]
fn notify_with_extras(
    app: &tauri::AppHandle,
    id: Option<i32>,
    title: &str,
    body: &str,
    extras: serde_json::Map<String, serde_json::Value>,
    _category: Option<&str>,
) -> Delivery {
    let mut builder = app.notification().builder().title(title).body(body);
    if let Some(id) = id {
        builder = builder.id(id);
    }
    for (k, v) in extras {
        builder = builder.extra(&k, v);
    }
    match builder.show() {
        Ok(()) => Delivery::Sent,
        Err(e) => {
            eprintln!("notification: {e}");
            Delivery::Undelivered
        }
    }
}

struct ResidentState(std::sync::Mutex<scheduler::SchedulerState>);
struct ResidentPersistStore(std::sync::Mutex<scheduler::ResidentPersist>);
struct ResidentDataDir(std::path::PathBuf);

#[tauri::command]
fn show_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_overlay(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("overlay") {
        let visible = window.is_visible().map_err(|e| e.to_string())?;
        if visible {
            window.hide().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("Overlay window not found".to_string())
    }
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn push_schedule_snapshot(
    state: tauri::State<'_, ResidentState>,
    snapshot: scheduler::ScheduleSnapshot,
) -> Result<bool, String> {
    let mut guard = state.0.lock().map_err(|_| LOCK_POISONED.to_string())?;
    Ok(scheduler::apply_snapshot(&mut guard, snapshot))
}

#[tauri::command]
fn report_session_activity(state: tauri::State<'_, ResidentState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| LOCK_POISONED.to_string())?;
    guard.last_activity_ms = scheduler::now_ms();
    Ok(())
}

#[tauri::command]
async fn dismiss_pending_checkins(state: tauri::State<'_, ResidentState>) -> Result<(), String> {
    {
        let mut guard = state.0.lock().map_err(|_| LOCK_POISONED.to_string())?;
        scheduler::clear_pending_checkins(&mut guard);
    }
    withdraw_delivered_checkins().await
}

/// Pausing takes back what the user can still see, not only what has not fired yet.
#[cfg(target_os = "macos")]
async fn withdraw_delivered_checkins() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| notification_macos::withdraw_delivered(KIND_CHECKIN))
        .await
        .map_err(|e| e.to_string())?
        .map(|_| ())
}

#[cfg(not(target_os = "macos"))]
async fn withdraw_delivered_checkins() -> Result<(), String> {
    Ok(())
}

/// Today's check-in budget state, for the frontend decision kernel.
#[tauri::command]
fn checkin_state(
    state: tauri::State<'_, ResidentState>,
    persisted: tauri::State<'_, ResidentPersistStore>,
) -> Result<CheckinStateSnapshot, String> {
    let guard = state.0.lock().map_err(|_| LOCK_POISONED.to_string())?;
    let persist = persisted.0.lock().map_err(|_| LOCK_POISONED.to_string())?;
    let now = scheduler::now_ms();
    let today = scheduler::day_key_of(
        now,
        guard.snapshot.checkin.tz_offset_min,
    );
    Ok(CheckinStateSnapshot {
        sent_today: scheduler::rolled_count(&persist, &today),
        last_activity_ms: guard.last_activity_ms,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckinStateSnapshot {
    sent_today: u32,
    last_activity_ms: u64,
}

#[tauri::command]
async fn notification_permission_state(app: tauri::AppHandle) -> Result<String, String> {
    notification_permission_state_impl(&app).await
}

#[cfg(target_os = "macos")]
async fn notification_permission_state_impl(_app: &tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(notification_macos::authorization_status)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(all(
    not(target_os = "macos"),
    not(any(target_os = "android", target_os = "ios"))
))]
async fn notification_permission_state_impl(app: &tauri::AppHandle) -> Result<String, String> {
    app.notification()
        .permission_state()
        .map(|s| s.to_string())
        .map_err(|e| e.to_string())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
async fn notification_permission_state_impl(_app: &tauri::AppHandle) -> Result<String, String> {
    Err("notification plugin unavailable on this platform".to_string())
}

#[tauri::command]
async fn request_notification_permission(app: tauri::AppHandle) -> Result<String, String> {
    request_notification_permission_impl(&app).await
}

#[cfg(target_os = "macos")]
async fn request_notification_permission_impl(_app: &tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(notification_macos::request_authorization)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(all(
    not(target_os = "macos"),
    not(any(target_os = "android", target_os = "ios"))
))]
async fn request_notification_permission_impl(app: &tauri::AppHandle) -> Result<String, String> {
    app.notification()
        .request_permission()
        .map(|s| s.to_string())
        .map_err(|e| e.to_string())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
async fn request_notification_permission_impl(_app: &tauri::AppHandle) -> Result<String, String> {
    Err("notification plugin unavailable on this platform".to_string())
}

#[tauri::command]
fn open_notification_settings(app: tauri::AppHandle) -> Result<(), String> {
    open_notification_settings_impl(&app)
}

#[cfg(target_os = "macos")]
fn open_notification_settings_impl(app: &tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(
            "x-apple.systempreferences:com.apple.preference.notifications",
            None::<&str>,
        )
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn open_notification_settings_impl(app: &tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url("ms-settings:notifications", None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
fn open_notification_settings_impl(_app: &tauri::AppHandle) -> Result<(), String> {
    Err("请在你的桌面环境的系统设置里查找「通知」".to_string())
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn open_notification_settings_impl(_app: &tauri::AppHandle) -> Result<(), String> {
    Err("通知设置仅桌面端可用".to_string())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NotificationCategoryLabels {
    reply: String,
    reply_placeholder: String,
    reply_button: String,
    complete: String,
}

/// Notification buttons differ per platform and per language, so the frontend hands
/// their labels over once at startup.
#[tauri::command]
async fn register_notification_categories(
    labels: NotificationCategoryLabels,
) -> Result<(), String> {
    register_notification_categories_impl(labels).await
}

#[cfg(target_os = "macos")]
async fn register_notification_categories_impl(
    labels: NotificationCategoryLabels,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        notification_macos::register_categories(
            &labels.reply,
            &labels.reply_placeholder,
            &labels.reply_button,
            &labels.complete,
        )
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
async fn register_notification_categories_impl(
    _labels: NotificationCategoryLabels,
) -> Result<(), String> {
    Ok(())
}

/// How far a check-in got: past the gate, and then to the user.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckinSend {
    /// The gate (budget, quiet hours, pause) let this slot through.
    accepted: bool,
    /// Absent when the gate suppressed the slot.
    delivery: Option<Delivery>,
}

#[tauri::command]
fn send_checkin_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
    memory_id: Option<i64>,
) -> Result<CheckinSend, String> {
    send_checkin_notification_impl(app, title, body, memory_id)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn send_checkin_notification_impl(
    app: tauri::AppHandle,
    title: String,
    body: String,
    memory_id: Option<i64>,
) -> Result<CheckinSend, String> {
    let now = scheduler::now_ms();
    let cfg = {
        let state_lock = app.state::<ResidentState>();
        let guard = state_lock.0.lock().map_err(|_| LOCK_POISONED.to_string())?;
        guard.snapshot.checkin.clone()
    };
    let persisted = app.state::<ResidentPersistStore>();
    let data_dir = app.state::<ResidentDataDir>().0.clone();
    let mut persist = persisted.0.lock().map_err(|_| LOCK_POISONED.to_string())?;
    let today = scheduler::day_key_of(now, cfg.tz_offset_min);
    let used = scheduler::rolled_count(&persist, &today);
    if !scheduler::gate_passed(used, &cfg, now) {
        return Ok(CheckinSend {
            accepted: false,
            delivery: None,
        });
    }
    persist.day = today;
    persist.checkins_sent = used + 1;
    if let Err(e) = scheduler::save_persist(&data_dir, &persist) {
        // 只丢当日计数的重启保留，不阻断发送。
        eprintln!("resident persist: {e}");
    }
    let mut extras = serde_json::Map::new();
    extras.insert("kind".into(), json!(KIND_CHECKIN));
    if let Some(id) = memory_id {
        extras.insert("memoryId".into(), json!(id));
    }
    // The budget is spent either way: a message the system would not carry still
    // reaches the user in-app, so it is not a slot to hand back.
    let delivery = deliver_proactive(&app, None, &title, &body, extras, CATEGORY_CHECKIN);
    let _ = app.emit(
        EVT_CHECKIN_SENT,
        json!({ "memoryId": memory_id, "sentAt": now }),
    );
    Ok(CheckinSend {
        accepted: true,
        delivery: Some(delivery),
    })
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn send_checkin_notification_impl(
    _app: tauri::AppHandle,
    _title: String,
    _body: String,
    _memory_id: Option<i64>,
) -> Result<CheckinSend, String> {
    Err("proactive check-ins are desktop-only".to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn deliver_outcome(app: &tauri::AppHandle, outcome: scheduler::TickOutcome) {
    for reminder in &outcome.reminder_fires {
        let mut extras = serde_json::Map::new();
        extras.insert("kind".into(), json!("reminder"));
        extras.insert("key".into(), json!(reminder.key));
        if let Some(session_id) = reminder.session_id {
            extras.insert("sessionId".into(), json!(session_id));
        }
        let delivery = deliver_proactive(
            app,
            reminder.key.parse::<i32>().ok(),
            &reminder.title,
            &reminder.body,
            extras,
            CATEGORY_REMINDER,
        );
        let _ = app.emit(
            EVT_REMINDER_FIRED,
            json!({
                "key": reminder.key,
                "title": reminder.title,
                "body": reminder.body,
                "sessionId": reminder.session_id,
                "triggerAt": reminder.trigger_at,
                "sentAt": scheduler::now_ms(),
                "delivery": delivery,
            }),
        );
    }
    for slot in &outcome.checkin_wakes {
        let _ = app.emit(EVT_CHECKIN_SLOT_WAKE, json!({ "slotAt": slot }));
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn start_scheduler_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let now = scheduler::now_ms();
        let outcome = {
            let state_lock = app.state::<ResidentState>();
            let mut guard = match state_lock.0.lock() {
                Ok(g) => g,
                Err(e) => {
                    eprintln!("scheduler: {e}");
                    continue;
                }
            };
            let tz = guard.snapshot.checkin.tz_offset_min;
            let today = scheduler::day_key_of(now, tz);
            let sent = {
                let persisted = app.state::<ResidentPersistStore>();
                let persist_guard = match persisted.0.lock() {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("scheduler: {e}");
                        continue;
                    }
                };
                scheduler::rolled_count(&persist_guard, &today)
            };
            scheduler::tick(&mut guard, sent, now)
        };
        deliver_outcome(&app, outcome);
    });
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_main = MenuItem::with_id(app, "open-main", "Open main window", true, None::<&str>)?;
    let show_overlay_item =
        MenuItem::with_id(app, "show-overlay", "Show companion overlay", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_main, &show_overlay_item, &quit])?;
    let mut tray = TrayIconBuilder::with_id("utsuwa-resident")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open-main" => show_window(app, "main"),
            "show-overlay" => show_window(app, "overlay"),
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn show_window(app: &tauri::AppHandle, label: &str) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

#[cfg(all(
    not(target_os = "macos"),
    not(any(target_os = "android", target_os = "ios"))
))]
fn handle_notification_action(
    app: &tauri::AppHandle,
    action: &tauri_plugin_notification::ActionPerformed,
) {
    if action.action_id() != "tap" {
        return;
    }
    // A tap must restore the window even when the payload is missing, otherwise a
    // notification without extras becomes a dead end.
    show_window(app, "main");
    let Some(notif) = action.notification() else {
        return;
    };
    let _ = app.emit(
        EVT_NOTIFICATION_ACTION,
        json!({
            "kind": notif.extra().get("kind"),
            "key": notif.extra().get("key"),
            "sessionId": notif.extra().get("sessionId"),
            "memoryId": notif.extra().get("memoryId"),
            "actionId": action.action_id(),
        }),
    );
}

/// An action on a notification the app posted itself; `payload` is the JSON the
/// delivery path encoded into the request identifier.
#[cfg(target_os = "macos")]
fn handle_native_notification_action(
    app: &tauri::AppHandle,
    payload: &str,
    action_id: &str,
    user_text: Option<&str>,
) {
    // The frontend only ever sees the small vocabulary "tap" | "reply" | "complete";
    // the system's own identifiers stay behind this boundary.
    let action = match action_id {
        notification_macos::ACTION_REPLY => "reply",
        notification_macos::ACTION_COMPLETE => "complete",
        other => other,
    };
    // A tap must restore the window even when the payload is missing, otherwise a
    // notification without extras becomes a dead end. Acting on a button does not
    // need it — that work happens behind the window.
    if action == "tap" {
        show_window(app, "main");
    }
    let Ok(mut extras) =
        serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(payload)
    else {
        return;
    };
    extras.insert("actionId".into(), json!(action));
    if let Some(text) = user_text {
        extras.insert("userText".into(), json!(text));
    }
    // Only the main window runs the chat pipeline, so events go there alone rather
    // than broadcasting and risking a reply being sent once per window.
    let _ = app.emit_to("main", EVT_NOTIFICATION_ACTION, extras);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init());

    // Updates ship as signed installers, so the updater is desktop-only.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init());

    builder
        .invoke_handler(tauri::generate_handler![
            show_overlay,
            toggle_overlay,
            show_main_window,
            push_schedule_snapshot,
            report_session_activity,
            dismiss_pending_checkins,
            checkin_state,
            notification_permission_state,
            request_notification_permission,
            open_notification_settings,
            register_notification_categories,
            send_checkin_notification
        ])
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.manage(ResidentState(std::sync::Mutex::new(
                scheduler::SchedulerState::default(),
            )));
            app.manage(ResidentPersistStore(std::sync::Mutex::new(
                scheduler::load_persist(&data_dir),
            )));
            app.manage(ResidentDataDir(data_dir));

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                start_scheduler_loop(app.handle().clone());
                build_tray(app)?;
            }
            #[cfg(target_os = "macos")]
            notification_macos::install_delegate({
                let handle = app.handle().clone();
                move |payload, action_id, user_text| {
                    handle_native_notification_action(&handle, payload, action_id, user_text)
                }
            });
            #[cfg(all(
                not(target_os = "macos"),
                not(any(target_os = "android", target_os = "ios"))
            ))]
            app.notification().on_action({
                let handle = app.handle().clone();
                move |action| handle_notification_action(&handle, action)
            })?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                api.prevent_close();
                let app = window.app_handle().clone();
                let first_hide = {
                    let persisted = app.state::<ResidentPersistStore>();
                    let lock_result = persisted.0.lock();
                    let first = match lock_result {
                        Ok(mut persist) => {
                            let first = !persist.hide_explained;
                            persist.hide_explained = true;
                            first
                        }
                        Err(e) => {
                            eprintln!("resident: {e}");
                            false
                        }
                    };
                    first
                };
                if first_hide {
                    let data_dir = app.state::<ResidentDataDir>().0.clone();
                    if let Ok(persist) = app.state::<ResidentPersistStore>().0.lock() {
                        if let Err(e) = scheduler::save_persist(&data_dir, &persist) {
                            eprintln!("resident persist: {e}");
                        }
                    }
                    #[cfg(not(any(target_os = "android", target_os = "ios")))]
                    {
                        let mut extras = serde_json::Map::new();
                        extras.insert("kind".into(), json!("resident-explain"));
                        notify_with_extras(
                            &app,
                            None,
                            "Utsuwa stays in your menu bar",
                            "The window is hidden and she's still here. Open or quit her from the menu bar icon.",
                            extras,
                            None,
                        );
                    }
                }
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
