fn main() {
    // Capture the build date and time so the app can display it (e.g. in the About section)
    let build_date = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();
    println!("cargo:rustc-env=BUILD_DATE={}", build_date);
    // Point rerun-if-changed at a file that never exists so this build script
    // reruns on every build, keeping BUILD_DATE fresh (tauri_build otherwise
    // emits rerun-if-changed directives that let cargo cache the old value).
    println!("cargo:rerun-if-changed=.nonexistent-force-rerun");

    tauri_build::build()
}
