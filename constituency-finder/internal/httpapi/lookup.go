package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"bc-election/constituency-finder/internal/finder"
)

func lookupHandler(service *finder.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		var input finder.Input
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			apiError(w, http.StatusBadRequest, "Enter a postal code or a valid location.")
			return
		}
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			apiError(w, http.StatusBadRequest, "Invalid request body.")
			return
		}
		result, err := service.Lookup(r.Context(), input)
		if err != nil {
			if r.Context().Err() != nil {
				return
			}
			status := http.StatusBadRequest
			if errors.Is(err, finder.ErrUnavailable) {
				status = http.StatusServiceUnavailable
			}
			if errors.Is(err, finder.ErrPostalMissing) {
				status = http.StatusNotFound
			}
			apiError(w, status, err.Error())
			return
		}
		_ = json.NewEncoder(w).Encode(result)
	}
}

func apiError(w http.ResponseWriter, status int, message string) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
