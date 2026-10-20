package httpapi

import (
	"net/http"

	"bc-election/constituency-finder/internal/finder"
)

type Config struct {
	DataDir    string
	ElectionID string
}

func NewHandler(config Config) http.Handler {
	service := finder.NewService(config.DataDir, config.ElectionID)
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/constituency-finder", lookupHandler(service))
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	return mux
}
