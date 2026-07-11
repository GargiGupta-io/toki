use serde::Serialize;
use std::sync::{Mutex, OnceLock};

const SCREEN_SAVER_WINDOW_LEVEL: isize = 1000;
const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
const STATIONARY: usize = 1 << 4;
const IGNORES_CYCLE: usize = 1 << 6;
const FULLSCREEN_AUXILIARY: usize = 1 << 8;
const CAN_JOIN_ALL_APPLICATIONS: usize = 1 << 18;

fn collection_behavior(can_join_all_applications: bool) -> usize {
    let mut behavior = CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE | FULLSCREEN_AUXILIARY;

    if can_join_all_applications {
        behavior |= CAN_JOIN_ALL_APPLICATIONS;
    }

    behavior
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowStatus {
    supported: bool,
    source: &'static str,
    level: Option<isize>,
    collection_behavior: Option<u64>,
    expected_collection_behavior: Option<u64>,
    can_join_all_spaces: bool,
    can_join_all_applications: bool,
    stationary: bool,
    ignores_cycle: bool,
    fullscreen_auxiliary: bool,
    ignores_mouse_events: bool,
    hides_on_deactivate: bool,
    can_hide: bool,
    opaque: bool,
    has_shadow: bool,
    pub(crate) visible: bool,
    pub(crate) on_active_space: bool,
    pub(crate) contract_ready: bool,
    pub(crate) ready: bool,
}

static LAST_STATUS: OnceLock<Mutex<Option<WindowStatus>>> = OnceLock::new();

fn remember_status(status: &WindowStatus) {
    let store = LAST_STATUS.get_or_init(|| Mutex::new(None));
    if let Ok(mut current) = store.lock() {
        *current = Some(status.clone());
    }
}

pub(crate) fn latest_status() -> Option<WindowStatus> {
    LAST_STATUS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|current| current.clone())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn unsupported_status() -> WindowStatus {
    WindowStatus {
        supported: false,
        source: "unsupported-platform",
        level: None,
        collection_behavior: None,
        expected_collection_behavior: None,
        can_join_all_spaces: false,
        can_join_all_applications: false,
        stationary: false,
        ignores_cycle: false,
        fullscreen_auxiliary: false,
        ignores_mouse_events: false,
        hides_on_deactivate: false,
        can_hide: false,
        opaque: false,
        has_shadow: false,
        visible: false,
        on_active_space: false,
        contract_ready: false,
        ready: false,
    }
}

#[cfg(target_os = "macos")]
fn supports_join_all_applications() -> bool {
    use std::process::Command;
    use std::sync::OnceLock;

    static SUPPORTS_JOIN_ALL_APPLICATIONS: OnceLock<bool> = OnceLock::new();

    *SUPPORTS_JOIN_ALL_APPLICATIONS.get_or_init(|| {
        Command::new("/usr/bin/sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .and_then(|version| version.trim().split('.').next()?.parse::<u32>().ok())
            .map(|major| major >= 13)
            .unwrap_or(true)
    })
}

#[cfg(target_os = "macos")]
pub(crate) fn inspect<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<WindowStatus, String> {
    use std::ffi::{c_char, c_void};

    extern "C" {
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }

    let ns_window_ptr = window.ns_window().map_err(|error| error.to_string())?;
    if ns_window_ptr.is_null() {
        return Err("overlay NSWindow pointer is null".to_string());
    }

    unsafe {
        let get_isize: extern "C" fn(*mut c_void, *mut c_void) -> isize =
            std::mem::transmute(objc_msgSend as *const ());
        let get_usize: extern "C" fn(*mut c_void, *mut c_void) -> usize =
            std::mem::transmute(objc_msgSend as *const ());
        let get_bool: extern "C" fn(*mut c_void, *mut c_void) -> bool =
            std::mem::transmute(objc_msgSend as *const ());

        let level = get_isize(ns_window_ptr, sel_registerName(b"level\0".as_ptr().cast()));
        let raw_behavior = get_usize(
            ns_window_ptr,
            sel_registerName(b"collectionBehavior\0".as_ptr().cast()),
        );
        let ignores_mouse_events = get_bool(
            ns_window_ptr,
            sel_registerName(b"ignoresMouseEvents\0".as_ptr().cast()),
        );
        let hides_on_deactivate = get_bool(
            ns_window_ptr,
            sel_registerName(b"hidesOnDeactivate\0".as_ptr().cast()),
        );
        let can_hide = get_bool(
            ns_window_ptr,
            sel_registerName(b"canHide\0".as_ptr().cast()),
        );
        let opaque = get_bool(
            ns_window_ptr,
            sel_registerName(b"isOpaque\0".as_ptr().cast()),
        );
        let has_shadow = get_bool(
            ns_window_ptr,
            sel_registerName(b"hasShadow\0".as_ptr().cast()),
        );
        let visible = get_bool(
            ns_window_ptr,
            sel_registerName(b"isVisible\0".as_ptr().cast()),
        );
        let on_active_space = get_bool(
            ns_window_ptr,
            sel_registerName(b"isOnActiveSpace\0".as_ptr().cast()),
        );

        let expects_join_all_applications = supports_join_all_applications();
        let expected_behavior = collection_behavior(expects_join_all_applications);
        let can_join_all_spaces = raw_behavior & CAN_JOIN_ALL_SPACES != 0;
        let can_join_all_applications = raw_behavior & CAN_JOIN_ALL_APPLICATIONS != 0;
        let stationary = raw_behavior & STATIONARY != 0;
        let ignores_cycle = raw_behavior & IGNORES_CYCLE != 0;
        let fullscreen_auxiliary = raw_behavior & FULLSCREEN_AUXILIARY != 0;
        let contract_ready = level == SCREEN_SAVER_WINDOW_LEVEL
            && raw_behavior & expected_behavior == expected_behavior
            && ignores_mouse_events
            && !hides_on_deactivate
            && !can_hide
            && !opaque
            && !has_shadow;

        Ok(WindowStatus {
            supported: true,
            source: "native-macos-appkit",
            level: Some(level),
            collection_behavior: Some(raw_behavior as u64),
            expected_collection_behavior: Some(expected_behavior as u64),
            can_join_all_spaces,
            can_join_all_applications,
            stationary,
            ignores_cycle,
            fullscreen_auxiliary,
            ignores_mouse_events,
            hides_on_deactivate,
            can_hide,
            opaque,
            has_shadow,
            visible,
            on_active_space,
            contract_ready,
            ready: contract_ready && visible && on_active_space,
        })
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn prepare<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<WindowStatus, String> {
    use std::ffi::{c_char, c_void};

    extern "C" {
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }

    let ns_window_ptr = window.ns_window().map_err(|error| error.to_string())?;
    if ns_window_ptr.is_null() {
        return Err("overlay NSWindow pointer is null".to_string());
    }

    // Match Clicky's overlay contract and add Apple's modern system-overlay flag.
    unsafe {
        let set_level: extern "C" fn(*mut c_void, *mut c_void, isize) =
            std::mem::transmute(objc_msgSend as *const ());
        let set_collection_behavior: extern "C" fn(*mut c_void, *mut c_void, usize) =
            std::mem::transmute(objc_msgSend as *const ());
        let set_bool: extern "C" fn(*mut c_void, *mut c_void, bool) =
            std::mem::transmute(objc_msgSend as *const ());
        let send_void: extern "C" fn(*mut c_void, *mut c_void) =
            std::mem::transmute(objc_msgSend as *const ());
        let behavior = collection_behavior(supports_join_all_applications());

        set_level(
            ns_window_ptr,
            sel_registerName(b"setLevel:\0".as_ptr().cast()),
            SCREEN_SAVER_WINDOW_LEVEL,
        );
        set_collection_behavior(
            ns_window_ptr,
            sel_registerName(b"setCollectionBehavior:\0".as_ptr().cast()),
            behavior,
        );
        set_bool(
            ns_window_ptr,
            sel_registerName(b"setIgnoresMouseEvents:\0".as_ptr().cast()),
            true,
        );
        set_bool(
            ns_window_ptr,
            sel_registerName(b"setHidesOnDeactivate:\0".as_ptr().cast()),
            false,
        );
        set_bool(
            ns_window_ptr,
            sel_registerName(b"setCanHide:\0".as_ptr().cast()),
            false,
        );
        set_bool(
            ns_window_ptr,
            sel_registerName(b"setOpaque:\0".as_ptr().cast()),
            false,
        );
        set_bool(
            ns_window_ptr,
            sel_registerName(b"setHasShadow:\0".as_ptr().cast()),
            false,
        );
        send_void(
            ns_window_ptr,
            sel_registerName(b"orderFrontRegardless\0".as_ptr().cast()),
        );
    }

    let status = inspect(window)?;
    remember_status(&status);
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::{
        collection_behavior, CAN_JOIN_ALL_APPLICATIONS, CAN_JOIN_ALL_SPACES, FULLSCREEN_AUXILIARY,
        IGNORES_CYCLE, STATIONARY,
    };

    #[test]
    fn contract_keeps_clicky_flags_and_adds_modern_space_support() {
        let legacy = collection_behavior(false);
        let modern = collection_behavior(true);
        let clicky_contract =
            CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE | FULLSCREEN_AUXILIARY;

        assert_eq!(legacy, clicky_contract);
        assert_eq!(legacy & CAN_JOIN_ALL_APPLICATIONS, 0);
        assert_eq!(modern & clicky_contract, clicky_contract);
        assert_ne!(modern & CAN_JOIN_ALL_APPLICATIONS, 0);

        let fullscreen_primary = 1_usize << 7;
        let fullscreen_none = 1_usize << 9;
        let primary = 1_usize << 16;
        let auxiliary = 1_usize << 17;
        assert_eq!(modern & fullscreen_primary, 0);
        assert_eq!(modern & fullscreen_none, 0);
        assert_eq!(modern & primary, 0);
        assert_eq!(modern & auxiliary, 0);
    }
}
