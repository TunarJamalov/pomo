//! Development tool (feature "snapshot"): renders the window to a PPM image without a display.
//!
//!   POMO_SNAPSHOT=out.ppm POMO_VIEW=timer POMO_SIZE=1120x760 cargo run --features snapshot
use slint::platform::software_renderer::{MinimalSoftwareWindow, RepaintBufferType};
use slint::platform::{Platform, WindowAdapter};
use slint::{PhysicalSize, PlatformError};
use std::rc::Rc;
use std::time::{Duration, Instant};

struct SnapshotPlatform {
    window: Rc<MinimalSoftwareWindow>,
    start: Instant,
}

impl Platform for SnapshotPlatform {
    fn create_window_adapter(&self) -> Result<Rc<dyn WindowAdapter>, PlatformError> {
        Ok(self.window.clone())
    }
    fn duration_since_start(&self) -> Duration {
        self.start.elapsed()
    }
}

/// Installs the off-screen platform. Must run before any window is created.
pub fn install() -> Rc<MinimalSoftwareWindow> {
    let window = MinimalSoftwareWindow::new(RepaintBufferType::NewBuffer);
    slint::platform::set_platform(Box::new(SnapshotPlatform {
        window: window.clone(),
        start: Instant::now(),
    }))
    .expect("platform already set");
    window
}

pub fn render(window: &MinimalSoftwareWindow, path: &str, width: u32, height: u32) {
    window.set_size(PhysicalSize::new(width, height));
    slint::platform::update_timers_and_animations();
    let mut buffer = vec![slint::Rgb8Pixel::default(); (width * height) as usize];
    // Draw twice so layouts that depend on a first pass settle
    window.dispatch_event(slint::platform::WindowEvent::Resized {
        size: slint::LogicalSize::new(width as f32, height as f32),
    });
    let mut drawn = false;
    for _ in 0..2 {
        slint::platform::update_timers_and_animations();
        window.request_redraw();
        drawn |= window.draw_if_needed(|renderer| {
            renderer.render(&mut buffer, width as usize);
        });
    }
    assert!(drawn, "nothing was drawn");
    let mut out = format!("P6\n{width} {height}\n255\n").into_bytes();
    for px in &buffer {
        out.extend_from_slice(&[px.r, px.g, px.b]);
    }
    std::fs::write(path, out).expect("write snapshot");
}
