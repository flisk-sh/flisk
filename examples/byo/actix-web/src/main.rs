use actix_web::{get, App, HttpResponse, HttpServer, Responder};

#[get("/health")]
async fn health() -> impl Responder {
    HttpResponse::Ok().body("ok")
}

#[get("/")]
async fn index() -> impl Responder {
    HttpResponse::Ok().body("hello from actix-web")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Listen beyond loopback and on the port Flisk assigns.
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8080);
    HttpServer::new(|| App::new().service(health).service(index))
        .bind(("0.0.0.0", port))?
        .run()
        .await
}
