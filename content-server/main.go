package main

import (
	"flag"
	"log"
	"net/http"
	"time"
)

func main() {
	addr := flag.String("addr", ":8000", "HTTP listen address")
	clientDir := flag.String("client-dir", "../client/dist", "directory containing the built client")
	dataDir := flag.String("data-dir", "../ingestion/storage/published", "directory containing published election data")
	electionID := flag.String("election-id", "bc-provincial-2026", "election to serve")
	finderURL := flag.String("finder-url", "http://127.0.0.1:8001", "constituency finder service URL")
	flag.Parse()

	server := &http.Server{
		Addr:              *addr,
		Handler:           newHandler(*clientDir, *dataDir, *electionID, *finderURL),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("Serving %s on %s", *clientDir, *addr)
	log.Fatal(server.ListenAndServe())
}
