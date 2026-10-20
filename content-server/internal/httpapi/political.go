package httpapi

import (
	"errors"
	"net/http"
	"os"

	"bc-election/content-server/internal/publication"
)

func registerPolitical(mux *http.ServeMux, store publication.Store) {
	mux.HandleFunc("GET /api/political/{kind}/{id}", func(w http.ResponseWriter, r *http.Request) {
		kind, id := r.PathValue("kind"), r.PathValue("id")
		if !publication.ValidID(store.ElectionID) || !publication.ValidID(id) || !publication.ValidKind(kind) {
			apiError(w, 404, "Political record not found.")
			return
		}
		record, err := store.Political(kind, id)
		if errors.Is(err, os.ErrNotExist) {
			apiError(w, 404, "Political record not found.")
			return
		}
		if err != nil {
			apiError(w, 503, "Published political data needs attention.")
			return
		}
		if kind == "candidates" {
			copy, err := store.CandidateCopy(id)
			if err != nil {
				apiError(w, 503, "Candidate display content needs attention.")
				return
			}
			if copy != nil {
				record["presentation"] = copy
			}
		}
		writeJSON(w, r, record)
	})
}
