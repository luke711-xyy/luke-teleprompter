fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        link_macos_compiler_runtime();
    }
    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn link_macos_compiler_runtime() {
    use std::{path::PathBuf, process::Command};

    let clang = Command::new("xcrun")
        .args(["--find", "clang"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|path| path.trim().to_string())
        .unwrap_or_else(|| "clang".to_string());
    let resource_dir = Command::new(clang)
        .arg("--print-resource-dir")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|path| PathBuf::from(path.trim()));

    if let Some(runtime_dir) = resource_dir.map(|path| path.join("lib/darwin")) {
        if runtime_dir.join("libclang_rt.osx.a").exists() {
            println!("cargo:rustc-link-search=native={}", runtime_dir.display());
            println!("cargo:rustc-link-lib=static=clang_rt.osx");
        }
    }
}
