package httpapi

import (
	"log"
	"net/http"

	"bc-election/content-server/internal/publication"
)

func registerGuide(mux *http.ServeMux, store publication.Store) {
	mux.HandleFunc("GET /api/guide", func(w http.ResponseWriter, r *http.Request) {
		guide, err := store.Guide()
		if err != nil {
			log.Printf("guide publication: %v", err)
			apiError(w, 503, "Guide content is unavailable.")
			return
		}
		writeJSON(w, r, guide)
	})
}
