package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
)

func writeJSON(w http.ResponseWriter, body any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

func main() {
	r := chi.NewRouter()

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]string{"status": "ok", "service": "chi"})
	})
	r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"service": "chi", "endpoints": []string{"/health"}})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	// ":" + port listens on every interface, which Traefik needs inside the container network.
	// TLS is terminated by Traefik; this hop stays inside the container network.
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
