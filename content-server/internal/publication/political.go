package publication

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

func (s Store) Political(kind, id string) (map[string]json.RawMessage, error) {
	if !ValidID(s.ElectionID) || !ValidID(id) || !ValidKind(kind) {
		return nil, errors.New("invalid political selection")
	}
	body, err := os.ReadFile(filepath.Join(s.DataDir, "political", s.ElectionID, kind, id+".json"))
	if err != nil {
		return nil, err
	}
	var record politicalEnvelope
	var public map[string]json.RawMessage
	var value any
	if json.Unmarshal(body, &record) != nil || json.Unmarshal(body, &public) != nil || json.Unmarshal(body, &value) != nil {
		return nil, errors.New("invalid political JSON")
	}
	expectedKind := "candidate_political_profile"
	if kind == "parties" {
		expectedKind = "party_political_platform"
	}
	if record.SchemaVersion != 1 || record.Kind != expectedKind || record.ID != id || record.ElectionID != s.ElectionID || containsResearchFields(value) {
		return nil, errors.New("invalid public political profile")
	}
	actions, err := reviewedActions(record.Actions)
	if err != nil {
		return nil, err
	}
	if err := validateIssues(record, actions); err != nil {
		return nil, err
	}
	if err := validateAlignment(record, actions); err != nil {
		return nil, err
	}
	if err := validateComparisonGuide(record); err != nil {
		return nil, err
	}
	return public, nil
}
