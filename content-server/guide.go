package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
)

type guideContent struct {
	SchemaVersion     int               `json:"schema_version"`
	ElectionID        string            `json:"election_id"`
	ReviewedOn        string            `json:"reviewedOn"`
	PartyRosterSource string            `json:"partyRosterSource"`
	Parties           []json.RawMessage `json:"parties"`
	OtherParties      []json.RawMessage `json:"otherParties"`
}

type candidateCopy struct {
	SchemaVersion int                        `json:"schema_version"`
	ElectionID    string                     `json:"election_id"`
	Candidates    map[string]json.RawMessage `json:"candidates"`
}

func loadGuide(contentDir, electionID string) (guideContent, error) {
	var guide guideContent
	if !safeID.MatchString(electionID) {
		return guide, errors.New("invalid election ID")
	}
	body, err := os.ReadFile(filepath.Join(contentDir, electionID, "guide.json"))
	if err != nil {
		return guide, err
	}
	if err = json.Unmarshal(body, &guide); err != nil {
		return guide, err
	}
	if guide.SchemaVersion != 1 || guide.ElectionID != electionID || guide.Parties == nil || guide.OtherParties == nil || guide.ReviewedOn == "" || guide.PartyRosterSource == "" {
		return guide, errors.New("invalid guide content")
	}
	seen := map[string]bool{}
	for _, raw := range append(append([]json.RawMessage{}, guide.Parties...), guide.OtherParties...) {
		var party struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Items []struct {
				Topic   string `json:"topic"`
				Summary string `json:"summary"`
				Points  []struct {
					Text          string `json:"text"`
					SourceIndices []int  `json:"sourceIndices"`
				} `json:"points"`
				Sources []struct {
					URL   string `json:"url"`
					Label string `json:"label"`
				} `json:"sources"`
			} `json:"items"`
		}
		if json.Unmarshal(raw, &party) != nil || !safeID.MatchString(party.ID) || seen[party.ID] || party.Name == "" || party.Items == nil {
			return guide, errors.New("invalid party guide")
		}
		seen[party.ID] = true
		for _, item := range party.Items {
			if item.Topic == "" || item.Summary == "" || len(item.Points) == 0 || len(item.Sources) == 0 {
				return guide, errors.New("invalid policy item")
			}
			for _, source := range item.Sources {
				if source.URL == "" || source.Label == "" {
					return guide, errors.New("invalid policy source")
				}
			}
			for _, point := range item.Points {
				if point.Text == "" || len(point.SourceIndices) == 0 {
					return guide, errors.New("invalid policy point")
				}
				for _, index := range point.SourceIndices {
					if index < 0 || index >= len(item.Sources) {
						return guide, errors.New("invalid policy citation")
					}
				}
			}
		}
	}
	return guide, nil
}

func loadCandidateCopy(contentDir, electionID, id string) (json.RawMessage, error) {
	body, err := os.ReadFile(filepath.Join(contentDir, electionID, "candidate-copy.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var copy candidateCopy
	if json.Unmarshal(body, &copy) != nil || copy.SchemaVersion != 1 || copy.ElectionID != electionID || copy.Candidates == nil {
		return nil, errors.New("invalid candidate display copy")
	}
	return copy.Candidates[id], nil
}

func apiError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func registerGuide(mux *http.ServeMux, contentDir, electionID string) {
	mux.HandleFunc("GET /api/guide", func(w http.ResponseWriter, r *http.Request) {
		guide, err := loadGuide(contentDir, electionID)
		if err != nil {
			apiError(w, 503, "Guide content is unavailable.")
			return
		}
		writeJSON(w, r, guide)
	})
	mux.Handle("GET /content/assets/", http.StripPrefix("/content/assets/", http.FileServer(http.Dir(filepath.Join(contentDir, "assets")))))
}
