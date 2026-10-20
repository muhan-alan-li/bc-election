package main

import (
	"flag"
	"log"
	"net/http"
	"time"

	"bc-election/constituency-finder/internal/httpapi"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8001", "HTTP listen address")
	dataDir := flag.String("data-dir", "../ingestion/storage/published", "directory containing published finder data")
	electionID := flag.String("election-id", "bc-provincial-2026", "election publication availability to report")
	flag.Parse()
	server := &http.Server{
		Addr:              *addr,
		Handler:           httpapi.NewHandler(httpapi.Config{DataDir: *dataDir, ElectionID: *electionID}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("Constituency finder listening on %s; dataset loads on first lookup", *addr)
	log.Fatal(server.ListenAndServe())
}
