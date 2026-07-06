fn main() {
    // Capture the build date and time so the app can display it (e.g. in the About section)
    let build_date = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();
    println!("cargo:rustc-env=BUILD_DATE={}", build_date);

    tauri_build::build()
}
