package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type platformRecord struct {
	SchemaVersion    int               `json:"schema_version"`
	Kind             string            `json:"kind"`
	ElectionID       string            `json:"election_id"`
	ID               string            `json:"id"`
	GeneratedAt      string            `json:"generated_at"`
	Party            json.RawMessage   `json:"party,omitempty"`
	BallotName       string            `json:"ballot_name,omitempty"`
	DistrictCode     string            `json:"district_code,omitempty"`
	Affiliation      string            `json:"affiliation,omitempty"`
	PartyID          *string           `json:"party_id"`
	PartyPlatformID  *string           `json:"party_platform_id"`
	ComparisonStatus string            `json:"comparison_status,omitempty"`
	RosterSource     json.RawMessage   `json:"roster_source"`
	Documents        []json.RawMessage `json:"documents"`
	Commitments      []json.RawMessage `json:"commitments"`
	ParsingStatus    string            `json:"parsing_status"`
	Coverage         json.RawMessage   `json:"coverage"`
}

func loadPlatforms(dataDir, electionID, kind string) ([]platformRecord, error) {
	if !safeID.MatchString(electionID) || (kind != "parties" && kind != "candidates") {
		return nil, errors.New("invalid platform selection")
	}
	folder := filepath.Join(dataDir, "platforms", electionID, kind)
	entries, err := os.ReadDir(folder)
	if errors.Is(err, os.ErrNotExist) {
		return []platformRecord{}, nil
	}
	if err != nil {
		return nil, err
	}
	result := []platformRecord{}
	seen := map[string]bool{}
	expectedKind := "party_platform"
	if kind == "candidates" {
		expectedKind = "candidate_platform"
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") || strings.HasSuffix(entry.Name(), ".attempt.json") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(folder, entry.Name()))
		if err != nil {
			return nil, err
		}
		var record platformRecord
		if err := json.Unmarshal(body, &record); err != nil {
			return nil, err
		}
		if record.SchemaVersion != 1 || record.ElectionID != electionID || record.Kind != expectedKind || !safeID.MatchString(record.ID) || seen[record.ID] || record.Documents == nil || record.Commitments == nil || len(record.Coverage) == 0 {
			return nil, errors.New("invalid platform dataset")
		}
		if kind == "candidates" && (!safeID.MatchString(record.DistrictCode) || record.BallotName == "") {
			return nil, errors.New("invalid candidate platform identity")
		}
		if kind == "parties" {
			var party struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			}
			if json.Unmarshal(record.Party, &party) != nil || !safeID.MatchString(party.ID) || party.Name == "" {
				return nil, errors.New("invalid party platform identity")
			}
		}
		var value any
		if json.Unmarshal(body, &value) != nil || containsResearchFields(value) {
			return nil, errors.New("platform is not polished client data")
		}
		seen[record.ID] = true
		result = append(result, record)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result, nil
}

func containsResearchFields(value any) bool {
	switch value := value.(type) {
	case map[string]any:
		for key, item := range value {
			switch key {
			case "blob", "pages", "tasks", "identity_leads":
				return true
			}
			if containsResearchFields(item) {
				return true
			}
		}
	case []any:
		for _, item := range value {
			if containsResearchFields(item) {
				return true
			}
		}
	}
	return false
}

func registerPlatforms(mux *http.ServeMux, dataDir, electionID string) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		kind, id := r.PathValue("kind"), r.PathValue("id")
		fail := func(status int, message string) {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
		}
		district := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("district")))
		if (kind != "parties" && kind != "candidates") || (id != "" && !safeID.MatchString(id)) || (district != "" && !safeID.MatchString(district)) {
			fail(404, "Platform selection not found.")
			return
		}
		records, err := loadPlatforms(dataDir, electionID, kind)
		if err != nil {
			fail(503, "Polished platform data needs attention.")
			return
		}
		filtered := []platformRecord{}
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
			fail(404, "Platform record not found.")
			return
		}
		writeJSON(w, r, map[string]any{"election_id": electionID, "platforms": filtered})
	}
	mux.HandleFunc("GET /api/platforms/{kind}", handler)
	mux.HandleFunc("GET /api/platforms/{kind}/{id}", handler)
}
