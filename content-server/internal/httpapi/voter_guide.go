package httpapi

import (
	"bc-election/content-server/internal/publication"
	"log"
	"net/http"
)

func registerVoterGuide(mux *http.ServeMux, store publication.Store) {
	mux.HandleFunc("GET /api/parties", func(w http.ResponseWriter, r *http.Request) {
		data, err := store.Parties()
		if err != nil {
			log.Printf("party registry: %v", err)
			apiError(w, 503, "Party labels are unavailable.")
			return
		}
		writeJSON(w, r, data)
	})
	mux.HandleFunc("GET /api/questionnaire", func(w http.ResponseWriter, r *http.Request) {
		data, err := store.Questionnaire()
		if err != nil {
			log.Printf("voter publication %s: %v", r.URL.Path, err)
			apiError(w, 503, "Party questionnaire is unavailable.")
			return
		}
		writeJSON(w, r, data)
	})
	mux.HandleFunc("GET /api/polling", func(w http.ResponseWriter, r *http.Request) {
		data, err := store.Polling()
		if err != nil {
			log.Printf("voter publication %s: %v", r.URL.Path, err)
			apiError(w, 503, "Polling context is unavailable.")
			return
		}
		writeJSON(w, r, data)
	})
}
