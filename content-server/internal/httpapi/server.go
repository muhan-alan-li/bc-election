package httpapi

import (
	"errors"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"sync"

	"bc-election/content-server/internal/publication"
)

// Config describes the filesystem and upstream dependencies of the HTTP server.
type Config struct {
	ClientDir  string
	DataDir    string
	ContentDir string
	ElectionID string
	FinderURL  string
}

func buildHandler(config Config) http.Handler {
	if config.ContentDir == "" {
		config.ContentDir = "content"
	}
	if config.FinderURL == "" {
		config.FinderURL = "http://127.0.0.1:8001"
	}
	store := publication.Store{DataDir: config.DataDir, ContentDir: config.ContentDir, ElectionID: config.ElectionID}
	mux := http.NewServeMux()
	registerDistricts(mux, store)
	registerPlatforms(mux, store)
	registerGuide(mux, store)
	registerVoterGuide(mux, store)
	registerPolitical(mux, store)
	registerFinderProxy(mux, config.FinderURL, nil)
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		checks := []func() error{
			func() error { _, err := store.Guide(); return err },
			func() error { _, err := store.Parties(); return err },
			func() error { _, err := store.Questionnaire(); return err },
			func() error { _, err := store.Polling(); return err },
			func() error {
				districts, err := store.Districts()
				if err != nil {
					return err
				}
				if len(districts) == 0 {
					return errors.New("no published constituencies")
				}
				return nil
			},
		}
		for _, check := range checks {
			if err := check(); err != nil {
				log.Printf("readiness: %v", err)
				apiError(w, 503, "Publication is not ready.")
				return
			}
		}
		writeJSON(w, r, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, r, map[string]string{"status": "ok"})
	})
	mux.Handle("GET /content/assets/", http.StripPrefix("/content/assets/", http.FileServer(http.Dir(filepath.Join(config.ContentDir, "assets")))))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		apiError(w, http.StatusNotFound, "API endpoint not found.")
	})
	mux.Handle("/", http.FileServer(http.Dir(config.ClientDir)))
	return mux
}

// Cache only the most recently selected handler; all its stores are pinned.
func NewHandler(config Config) http.Handler {
	if config.ContentDir == "" {
		config.ContentDir = "content"
	}
	base := buildHandler(config)
	var mutex sync.Mutex
	var cachedGeneration string
	var cached http.Handler
	return securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") && !strings.HasPrefix(r.URL.Path, "/content/") && r.URL.Path != "/ready" {
			base.ServeHTTP(w, r)
			return
		}
		store, generation, err := (publication.Store{DataDir: config.DataDir, ContentDir: config.ContentDir, ElectionID: config.ElectionID}).Pin()
		if err != nil {
			log.Printf("active publication: %v", err)
			apiError(w, 503, "Publication is unavailable.")
			return
		}
		w.Header().Set("X-Publication-Generation", generation)
		if generation == "legacy" {
			base.ServeHTTP(w, r)
			return
		}
		mutex.Lock()
		if cachedGeneration != generation {
			snapshot := config
			snapshot.DataDir, snapshot.ContentDir = store.DataDir, store.ContentDir
			cached = buildHandler(snapshot)
			cachedGeneration = generation
		}
		handler := cached
		mutex.Unlock()
		handler.ServeHTTP(w, r)
	}))
}
