//! Talking to pomofocus.online. Every call here blocks, so it runs on a worker thread.
use serde_json::Value;
use std::time::Duration;

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .http_status_as_error(false)
        .build()
        .into()
}

fn describe_failure(status: u16, data: &Value) -> String {
    let raw = data
        .get("error")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    match status {
        401 | 403 => "Your connection expired. Press \"Connect with Discord\" to link the app again.".into(),
        404 => "Sync endpoint was not found. Check the API URL.".into(),
        409 if !raw.is_empty() => raw,
        409 => "This session was already synced.".into(),
        500.. => "Pomo server is having trouble. Try syncing again later.".into(),
        _ if !raw.is_empty() => raw,
        _ => "Sync failed. Check your token and API URL.".into(),
    }
}

fn network_error(err: ureq::Error) -> String {
    match err {
        ureq::Error::Timeout(_) => "The Pomo server took too long to answer. Try again in a moment.".into(),
        ureq::Error::Io(_) | ureq::Error::HostNotFound | ureq::Error::ConnectionFailed => {
            "Network error. Check your internet connection or API URL.".into()
        }
        other => format!("Could not sync session: {other}"),
    }
}

fn finish(mut response: ureq::http::Response<ureq::Body>) -> Result<Value, String> {
    let status = response.status().as_u16();
    let data: Value = response.body_mut().read_json().unwrap_or(Value::Null);
    if (200..300).contains(&status) {
        Ok(data)
    } else {
        Err(describe_failure(status, &data))
    }
}

/// Sends a finished focus session. The reply has `duplicate`, `user`, `profile` and `reward`.
pub fn post_session(api_url: &str, token: &str, body: &Value) -> Result<Value, String> {
    let response = agent()
        .post(api_url)
        .header("Authorization", &format!("Bearer {token}"))
        .send_json(body)
        .map_err(network_error)?;
    finish(response)
}

/// Checks the connection and returns the user's Pomo profile.
pub fn check(api_url: &str, token: &str) -> Result<Value, String> {
    let response = agent()
        .get(api_url)
        .header("Authorization", &format!("Bearer {token}"))
        .call()
        .map_err(network_error)?;
    finish(response)
}

/// Downloads a small image (the Discord avatar).
pub fn download(url: &str) -> Option<Vec<u8>> {
    let mut response = agent().get(url).call().ok()?;
    if !response.status().is_success() {
        return None;
    }
    response
        .body_mut()
        .with_config()
        .limit(2 * 1024 * 1024)
        .read_to_vec()
        .ok()
}
