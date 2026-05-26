use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use std::time::Duration;

const HEALTH_URL: &str = "http://127.0.0.1:8765/health";
const POLL_INTERVAL_MS: u64 = 500;
const MAX_POLLS: u32 = 60; // 30 seconds timeout

async fn wait_for_backend() -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_default();
    for _ in 0..MAX_POLLS {
        if client.get(HEALTH_URL).send().await.is_ok() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Spawn sidecar
            let sidecar = app
                .shell()
                .sidecar("fastapi-server")
                .expect("fastapi-server sidecar not found");
            let (_rx, _child) = sidecar.spawn().expect("failed to spawn fastapi-server");

            // Poll health in background, then show window
            tauri::async_runtime::spawn(async move {
                let ready = wait_for_backend().await;
                if let Some(window) = handle.get_webview_window("main") {
                    if ready {
                        let _ = window.show();
                        let _ = window.set_focus();
                    } else {
                        // Backend never came up — show anyway so user sees something
                        let _ = window.show();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
