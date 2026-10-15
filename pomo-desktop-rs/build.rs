fn main() {
    let config = slint_build::CompilerConfiguration::new().embed_resources(slint_build::EmbedResourcesKind::EmbedFiles);
    slint_build::compile_with_config("ui/app.slint", config).expect("Slint build failed");

    // Windows: the app icon and name shown by Explorer, the taskbar and the installer
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("assets/icon.ico");
        res.set("ProductName", "Pomo Focus");
        res.set("FileDescription", "Pomo Focus");
        res.set("CompanyName", "Tunar Jamalov");
        res.set("LegalCopyright", "AGPL-3.0, Tunar Jamalov");
        res.compile().expect("Windows resources");
    }
}
