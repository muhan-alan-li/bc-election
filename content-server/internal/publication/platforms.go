package publication

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Platform struct {
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

func (s Store) Platforms(kind string) ([]Platform, error) {
	if !safeID.MatchString(s.ElectionID) || !ValidKind(kind) {
		return nil, errors.New("invalid platform selection")
	}
	folder := filepath.Join(s.DataDir, "platforms", s.ElectionID, kind)
	entries, err := os.ReadDir(folder)
	if errors.Is(err, os.ErrNotExist) {
		return []Platform{}, nil
	}
	if err != nil {
		return nil, err
	}
	result := []Platform{}
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
		var record Platform
		if err := json.Unmarshal(body, &record); err != nil {
			return nil, err
		}
		if record.SchemaVersion != 1 || record.ElectionID != s.ElectionID || record.Kind != expectedKind || !safeID.MatchString(record.ID) || seen[record.ID] || record.Documents == nil || record.Commitments == nil || len(record.Coverage) == 0 {
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
