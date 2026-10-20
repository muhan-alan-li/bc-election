package httpapi

import (
	"net/http"
	"strings"

	"bc-election/content-server/internal/publication"
)

func registerPlatforms(mux *http.ServeMux, store publication.Store) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		kind, id := r.PathValue("kind"), r.PathValue("id")
		district := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("district")))
		if !publication.ValidKind(kind) || (id != "" && !publication.ValidID(id)) || (district != "" && !publication.ValidID(district)) {
			apiError(w, 404, "Platform selection not found.")
			return
		}
		records, err := store.Platforms(kind)
		if err != nil {
			apiError(w, 503, "Polished platform data needs attention.")
			return
		}
		filtered := []publication.Platform{}
		for _, record := range records {
			if district != "" && record.DistrictCode != district {
				continue
			}
			if id != "" {
				if record.ID == id {
					writeJSON(w, r, record)
					return
				}
				continue
			}
			filtered = append(filtered, record)
		}
		if id != "" {
			apiError(w, 404, "Platform record not found.")
			return
		}
		writeJSON(w, r, map[string]any{"election_id": store.ElectionID, "platforms": filtered})
	}
	mux.HandleFunc("GET /api/platforms/{kind}", handler)
	mux.HandleFunc("GET /api/platforms/{kind}/{id}", handler)
}
