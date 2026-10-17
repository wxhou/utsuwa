//! macOS notification layer.
//!
//! tauri-plugin-notification's desktop backend cannot back this app on macOS: it
//! reports `Granted` from `request_permission`/`permission_state` without ever
//! asking the system, and it swallows delivery failures inside a thread it spawns
//! for each notification (`let Ok(handle) = notification.show() else { return; }`),
//! so a notification that never reached the user is indistinguishable from one
//! that did. This module talks to `UNUserNotificationCenter` directly instead:
//! authorization state, delivery, and the delegate that turns a click back into
//! an app-level callback.

use std::ptr::NonNull;
use std::sync::mpsc;
use std::time::Duration;

use block2::{DynBlock, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{NSObjectProtocol, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread, DefinedClass};
use objc2_foundation::{NSArray, NSError, NSObject, NSSet, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
    UNNotificationAction, UNNotificationActionOptions, UNNotificationCategory,
    UNNotificationCategoryOptions, UNNotificationDefaultActionIdentifier,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse,
    UNNotificationSettings, UNNotificationSound, UNTextInputNotificationAction,
    UNTextInputNotificationResponse, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};

// The system runs these completion handlers on its own queue; a callback that
// never arrives must not pin the calling thread forever.
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(5);
const UNKNOWN: &str = "unknown";
/// The one status that means the system will actually show what this app posts.
const GRANTED: &str = "granted";

/// Marks an identifier as ours and delimits the JSON payload that follows it.
const IDENT_PREFIX: &str = "utsuwa:";

/// Categories the app registers. A notification only gets buttons if it names one.
pub const CATEGORY_CHECKIN: &str = "utsuwa.checkin";
pub const CATEGORY_REMINDER: &str = "utsuwa.reminder";

/// Action identifiers reported back through the delegate.
pub const ACTION_REPLY: &str = "utsuwa.action.reply";
pub const ACTION_COMPLETE: &str = "utsuwa.action.complete";

/// Every proactive notification shares one thread, so Notification Center groups
/// them instead of growing a row per message.
const THREAD: &str = "utsuwa.proactive";

/// The `kind` recorded inside an identifier this app produced, if it is ours.
fn identifier_kind(identifier: &str) -> Option<String> {
    let payload = identifier.strip_prefix(IDENT_PREFIX)?;
    let extras: serde_json::Map<String, serde_json::Value> = serde_json::from_str(payload).ok()?;
    extras.get("kind")?.as_str().map(str::to_owned)
}

/// Reported in the vocabulary the plugin used, so callers see one contract.
fn status_name(status: UNAuthorizationStatus) -> &'static str {
    if status == UNAuthorizationStatus::Denied {
        "denied"
    } else if status == UNAuthorizationStatus::NotDetermined {
        "prompt"
    } else if status == UNAuthorizationStatus::Authorized
        || status == UNAuthorizationStatus::Provisional
        || status == UNAuthorizationStatus::Ephemeral
    {
        GRANTED
    } else {
        UNKNOWN
    }
}

/// Whether the system will actually put what this app posts in front of the user.
///
/// `addNotificationRequest` reports success even while the app is unauthorized, so
/// a delivery decision has to read this first or a refused request is
/// indistinguishable from a delivered one.
pub fn is_authorized() -> bool {
    authorization_status() == GRANTED
}

pub fn authorization_status() -> String {
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let (tx, rx) = mpsc::channel();
    let completion = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        // SAFETY: the completion handler contract guarantees a live settings object.
        let status = unsafe { settings.as_ref() }.authorizationStatus();
        let _ = tx.send(status_name(status).to_string());
    });
    center.getNotificationSettingsWithCompletionHandler(&completion);
    rx.recv_timeout(CALLBACK_TIMEOUT)
        .unwrap_or_else(|_| UNKNOWN.to_string())
}

pub fn request_authorization() -> String {
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let (tx, rx) = mpsc::channel();
    let completion = RcBlock::new(move |granted: objc2::runtime::Bool, _error: *mut NSError| {
        let _ = tx.send(granted.as_bool());
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert
            | UNAuthorizationOptions::Sound
            | UNAuthorizationOptions::Badge,
        &completion,
    );
    match rx.recv_timeout(CALLBACK_TIMEOUT) {
        Ok(true) => "granted".to_string(),
        Ok(false) => "denied".to_string(),
        Err(_) => UNKNOWN.to_string(),
    }
}

/// Posts an immediate notification and reports the system's verdict.
///
/// The payload rides in the request identifier rather than in `userInfo`: objc2
/// exposes that property only as an untyped `NSDictionary`, while the identifier
/// is a plain string that the action callback reads back verbatim.
pub fn post(
    title: &str,
    body: &str,
    extras: &serde_json::Map<String, serde_json::Value>,
    category: Option<&str>,
) -> Result<(), String> {
    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(title));
    content.setBody(&NSString::from_str(body));
    content.setSound(Some(&UNNotificationSound::defaultSound()));
    content.setThreadIdentifier(&NSString::from_str(THREAD));
    if let Some(category) = category {
        content.setCategoryIdentifier(&NSString::from_str(category));
    }
    let identifier = format!(
        "{IDENT_PREFIX}{}",
        serde_json::Value::Object(extras.clone())
    );
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &NSString::from_str(&identifier),
        &content,
        None,
    );

    let (tx, rx) = mpsc::channel();
    let completion = RcBlock::new(move |error: *mut NSError| {
        // The error is only guaranteed to live for the duration of the call, so it
        // is read here rather than handed to the other thread.
        let message = unsafe { error.as_ref() }.map(|e| e.localizedDescription().to_string());
        let _ = tx.send(message);
    });
    UNUserNotificationCenter::currentNotificationCenter()
        .addNotificationRequest_withCompletionHandler(&request, Some(&completion));

    match rx.recv_timeout(CALLBACK_TIMEOUT) {
        Ok(None) => Ok(()),
        Ok(Some(message)) => Err(message),
        Err(_) => Err("the system never confirmed delivery".to_string()),
    }
}

/// Registers the button sets a notification can carry.
///
/// Labels arrive from the frontend so they are written in the user's language, and
/// the system resolves them when a notification is displayed — registering after
/// a notification has been posted is therefore fine.
pub fn register_categories(
    reply: &str,
    reply_placeholder: &str,
    reply_button: &str,
    complete: &str,
) {
    let reply_action =
        UNTextInputNotificationAction::actionWithIdentifier_title_options_textInputButtonTitle_textInputPlaceholder(
            &NSString::from_str(ACTION_REPLY),
            &NSString::from_str(reply),
            UNNotificationActionOptions::empty(),
            &NSString::from_str(reply_button),
            &NSString::from_str(reply_placeholder),
        );
    let complete_action = UNNotificationAction::actionWithIdentifier_title_options(
        &NSString::from_str(ACTION_COMPLETE),
        &NSString::from_str(complete),
        UNNotificationActionOptions::empty(),
    );
    let reply_action: &UNNotificationAction = &reply_action;
    let complete_action: &UNNotificationAction = &complete_action;
    let intents: Retained<NSArray<NSString>> = NSArray::from_retained_slice(&[]);

    let checkin = UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
        &NSString::from_str(CATEGORY_CHECKIN),
        &NSArray::from_slice(&[reply_action]),
        &intents,
        UNNotificationCategoryOptions::empty(),
    );
    let reminder = UNNotificationCategory::categoryWithIdentifier_actions_intentIdentifiers_options(
        &NSString::from_str(CATEGORY_REMINDER),
        &NSArray::from_slice(&[complete_action]),
        &intents,
        UNNotificationCategoryOptions::empty(),
    );
    UNUserNotificationCenter::currentNotificationCenter()
        .setNotificationCategories(&NSSet::from_slice(&[&*checkin, &*reminder]));
}

/// Takes delivered notifications of one kind back out of Notification Center.
///
/// Only notifications this app produced carry a readable identifier, so anything
/// else the system lists is left alone.
pub fn withdraw_delivered(kind: &str) -> Result<usize, String> {
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let (tx, rx) = mpsc::channel();
    let kind = kind.to_owned();
    let completion = RcBlock::new(move |notifications: NonNull<NSArray<UNNotification>>| {
        // SAFETY: the completion handler contract guarantees a live array.
        let notifications = unsafe { notifications.as_ref() };
        let identifiers: Vec<Retained<NSString>> = notifications
            .iter()
            .map(|notification| notification.request().identifier())
            .filter(|identifier| identifier_kind(&identifier.to_string()).as_deref() == Some(&kind))
            .collect();
        let _ = tx.send(identifiers);
    });
    center.getDeliveredNotificationsWithCompletionHandler(&completion);

    let identifiers = rx
        .recv_timeout(CALLBACK_TIMEOUT)
        .map_err(|_| "the system never listed the delivered notifications".to_string())?;
    let withdrawn = identifiers.len();
    if withdrawn > 0 {
        center.removeDeliveredNotificationsWithIdentifiers(&NSArray::from_retained_slice(
            &identifiers,
        ));
    }
    Ok(withdrawn)
}

/// The action identifier the system reports for a plain click on the notification.
fn is_default_action(action: &str) -> bool {
    // SAFETY: this framework constant is an immutable `NSString` that the system owns.
    let default_action = unsafe { UNNotificationDefaultActionIdentifier };
    action == default_action.to_string()
}

/// What the app gets told about a notification action: the payload it encoded, the
/// action id, and the text typed into a reply.
type ActionHandler = dyn Fn(&str, &str, Option<&str>) + Send + Sync;

struct DelegateIvars {
    on_action: Box<ActionHandler>,
}

define_class!(
    // SAFETY: NSObject imposes no subclassing requirements, and this class does not
    // implement Drop.
    #[unsafe(super(NSObject))]
    #[name = "UtsuwaNotificationDelegate"]
    #[ivars = DelegateIvars]
    struct NotificationDelegate;

    unsafe impl NSObjectProtocol for NotificationDelegate {}

    unsafe impl UNUserNotificationCenterDelegate for NotificationDelegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            // Check-ins fire whether or not Utsuwa happens to be frontmost; without
            // this the banner is suppressed whenever she is the active app.
            completion_handler.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::Sound
                | UNNotificationPresentationOptions::List,));
        }

        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive(
            &self,
            _center: &UNUserNotificationCenter,
            response: &UNNotificationResponse,
            completion_handler: &DynBlock<dyn Fn()>,
        ) {
            let raw_action = response.actionIdentifier().to_string();
            // A plain click reaches the app as "tap" here, which is the id the
            // plugin's path already used — callers see one vocabulary either way.
            let action = if is_default_action(&raw_action) {
                "tap".to_string()
            } else {
                raw_action
            };
            let user_text = response
                .downcast_ref::<UNTextInputNotificationResponse>()
                .map(|typed| typed.userText().to_string());
            let payload = response
                .notification()
                .request()
                .identifier()
                .to_string()
                .strip_prefix(IDENT_PREFIX)
                .map(str::to_owned);
            // The system is done with us the moment the payload is in hand; the app
            // work that follows must not delay it.
            completion_handler.call(());
            if let Some(payload) = payload {
                (self.ivars().on_action)(&payload, &action, user_text.as_deref());
            }
        }
    }
);

/// Registers the action handler with the system notification center.
///
/// The callback receives the notification's payload, the action id (`"tap"` for a
/// plain click) and, for a reply, the typed text.
///
/// The center holds its delegate weakly, so the single instance is leaked: it has
/// to outlive every notification the process may still show.
pub fn install_delegate<F>(on_action: F)
where
    F: Fn(&str, &str, Option<&str>) + Send + Sync + 'static,
{
    let delegate = NotificationDelegate::alloc();
    let delegate = delegate.set_ivars(DelegateIvars {
        on_action: Box::new(on_action),
    });
    // SAFETY: `init` is NSObject's initializer, and this class declares no others;
    // the ivars are already set.
    let delegate: Retained<NotificationDelegate> = unsafe { msg_send![super(delegate), init] };
    // SAFETY: the pointer comes from `into_raw`, which transfers ownership here, and
    // it is deliberately never freed.
    let delegate: &'static NotificationDelegate = unsafe { &*Retained::into_raw(delegate) };
    UNUserNotificationCenter::currentNotificationCenter()
        .setDelegate(Some(ProtocolObject::from_ref(delegate)));
}
