package httpapi

import (
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"bc-election/content-server/internal/publication"
)

func registerDistricts(mux *http.ServeMux, store publication.Store) {
	mux.HandleFunc("GET /api/districts/{code}/ballot", func(w http.ResponseWriter, r *http.Request) {
		code := strings.ToUpper(r.PathValue("code"))
		if !publication.ValidID(code) {
			apiError(w, 404, "Constituency not found.")
			return
		}
		data, err := store.Ballot(code)
		if errors.Is(err, os.ErrNotExist) {
			apiError(w, 404, "This ballot has not been published yet.")
			return
		}
		if err != nil {
			log.Printf("ballot %s: %v", code, err)
			apiError(w, 503, "Ballot data is unavailable.")
			return
		}
		writeJSON(w, r, data)
	})
	mux.HandleFunc("GET /api/districts", func(w http.ResponseWriter, r *http.Request) {
		if !publication.ValidID(store.ElectionID) {
			apiError(w, 503, "Election configuration is invalid.")
			return
		}
		districts, err := store.Districts()
		if err != nil {
			log.Print(err)
			message := "Published constituency data needs attention."
			if errors.Is(err, publication.ErrCatalogUnavailable) {
				message = "Constituency data is unavailable."
			}
			apiError(w, 503, message)
			return
		}
		if query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q"))); query != "" {
			filtered := []publication.District{}
			for _, district := range districts {
				if strings.Contains(strings.ToLower(district.Name), query) || strings.Contains(strings.ToLower(district.Code), query) {
					filtered = append(filtered, district)
				}
			}
			districts = filtered
		}
		writeJSON(w, r, map[string]any{"election_id": store.ElectionID, "districts": districts})
	})
	mux.HandleFunc("GET /api/districts/{code}", func(w http.ResponseWriter, r *http.Request) {
		code := strings.ToUpper(r.PathValue("code"))
		if !publication.ValidID(store.ElectionID) || !publication.ValidID(code) {
			apiError(w, 404, "Constituency not found.")
			return
		}
		data, err := store.District(code)
		if errors.Is(err, os.ErrNotExist) {
			apiError(w, 404, "This constituency has not been published yet.")
			return
		}
		if err != nil {
			log.Print(err)
			apiError(w, 503, "Published constituency data needs attention.")
			return
		}
		writeJSON(w, r, data)
	})
}
