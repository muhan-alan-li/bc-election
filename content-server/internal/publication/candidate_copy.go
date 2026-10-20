package publication

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type candidateCopy struct {
	SchemaVersion int                        `json:"schema_version"`
	ElectionID    string                     `json:"election_id"`
	Candidates    map[string]json.RawMessage `json:"candidates"`
}

func (s Store) CandidateCopy(id string) (json.RawMessage, error) {
	if !ValidID(s.ElectionID) || !ValidID(id) {
		return nil, errors.New("invalid candidate selection")
	}
	var copy candidateCopy
	err := readJSON(filepath.Join(s.ContentDir, s.ElectionID, "candidate-copy.json"), &copy)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if copy.SchemaVersion != 1 || copy.ElectionID != s.ElectionID || copy.Candidates == nil {
		return nil, errors.New("invalid candidate display copy")
	}
	return copy.Candidates[id], nil
}
