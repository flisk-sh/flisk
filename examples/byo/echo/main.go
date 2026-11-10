package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"

	"github.com/labstack/echo/v5"
)

func main() {
	e := echo.New()
	// Set ExtractIPDirect explicitly so the client IP never comes from a client-supplied
	// X-Forwarded-For / X-Real-IP header (the rate-limiter and proxy advisories).
	e.IPExtractor = echo.ExtractIPDirect()

	e.GET("/health", func(c *echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok", "service": "echo"})
	})
	e.GET("/", func(c *echo.Context) error {
		return c.JSON(http.StatusOK, map[string]any{"service": "echo", "endpoints": []string{"/health"}})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	// ":" + port listens on every interface, which Traefik needs inside the container network.
	sc := echo.StartConfig{Address: ":" + port, HideBanner: true}
	if err := sc.Start(ctx, e); err != nil {
		log.Fatal(err)
	}
}
