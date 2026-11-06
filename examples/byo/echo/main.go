package main

import (
	"net/http"
	"os"

	"github.com/labstack/echo/v4"
)

func main() {
	e := echo.New()
	e.HideBanner = true
	// CVE-2026-118653 / CVE-2026-118651: without an IPExtractor the pre-v4.16.3
	// default trusted client-supplied X-Forwarded-For / X-Real-IP. v4.16.3 already
	// ignores those headers by default; set ExtractIPDirect explicitly so the
	// example never relies on the legacy fallback.
	e.IPExtractor = echo.ExtractIPDirect()

	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{"status": "ok", "service": "echo"})
	})
	e.GET("/", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]any{"service": "echo", "endpoints": []string{"/health"}})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	// ":" + port listens on every interface, which Traefik needs inside the container network.
	e.Logger.Fatal(e.Start(":" + port))
}
