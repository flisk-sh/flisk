// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendLanguageProvider } from "./types.js";

/**
 * Rust is compiled into the image and has no reload process, so the dev command is only what a developer
 * would run by hand. Tilt rebuilds the image when a watched file changes (the engine returns no live-update rules).
 */
export const RUST_DEV_COMMAND = "cargo run";

export const rustBackendProvider: BackendLanguageProvider = {
  id: "rust",
  label: "Rust (axum)",
  devCommand: RUST_DEV_COMMAND,
  watch: ["src/**/*.rs", "Cargo.toml", "Cargo.lock"],
  installHint: "cargo build   # optional: Docker builds the image for you",
  createFiles(name) {
    return [
      {
        filename: "Cargo.toml",
        content: `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

# The image copies the release binary by this fixed name.
[[bin]]
name = "app"
path = "src/main.rs"

[dependencies]
axum = "0.8"
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "net"] }
`,
        description: "Generating Cargo.toml",
        emoji: "📦",
      },
      {
        filename: "src/main.rs",
        content: `use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

fn app() -> Router {
    Router::new()
        .route("/", get(root))
        // Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
        .route("/health", get(health))
}

async fn root() -> Json<Value> {
    Json(json!({ "service": "${name}", "version": "1.0.0", "endpoints": ["/health"] }))
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "service": "${name}" }))
}

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());

    // 0.0.0.0 listens on every interface, which Traefik needs inside the container network.
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("failed to bind the port");
    println!("${name} listening on 0.0.0.0:{port}");
    axum::serve(listener, app()).await.expect("server error");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn health_reports_ok() {
        let Json(body) = health().await;
        assert_eq!(body["status"], "ok");
    }
}
`,
        description: "Generating backend source and smoke test",
        emoji: "💻",
      },
    ];
  },
};
