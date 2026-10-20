package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"bc-election/content-server/internal/httpapi"
)

func main() {
	addr := flag.String("addr", ":8000", "HTTP listen address")
	clientDir := flag.String("client-dir", "../client/dist", "directory containing the built client")
	dataDir := flag.String("data-dir", "../ingestion/storage/published", "directory containing published election data")
	electionID := flag.String("election-id", "bc-provincial-2026", "election to serve")
	finderURL := flag.String("finder-url", "http://127.0.0.1:8001", "constituency finder service URL")
	contentDir := flag.String("content-dir", "content", "directory containing reviewed guide content and portraits")
	flag.Parse()

	config := httpapi.Config{
		ClientDir:  *clientDir,
		DataDir:    *dataDir,
		ContentDir: *contentDir,
		ElectionID: *electionID,
		FinderURL:  *finderURL,
	}
	for _, path := range []string{filepath.Join(*clientDir, "index.html"), *contentDir} {
		if _, err := os.Stat(path); err != nil {
			log.Fatalf("Startup path %s: %v", path, err)
		}
	}
	server := &http.Server{
		Addr:              *addr,
		Handler:           httpapi.NewHandler(config),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      45 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("Serving %s on %s", *clientDir, *addr)
	stop, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	go func() {
		<-stop.Done()
		ctx, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Shutdown: %v", err)
		}
	}()
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
