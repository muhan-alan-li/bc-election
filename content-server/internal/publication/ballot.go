package publication

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type Catalog struct {
	SchemaVersion int        `json:"schema_version"`
	ElectionID    string     `json:"election_id"`
	Districts     []District `json:"districts"`
}

func (c Catalog) validate(election string) error {
	if c.SchemaVersion != 1 || c.ElectionID != election || c.Districts == nil {
		return errors.New("invalid catalog")
	}
	seen := map[string]bool{}
	for _, d := range c.Districts {
		if !ValidID(d.Code) || d.ID == "" || d.Name == "" || d.CandidateCount < 0 || seen[d.Code] {
			return errors.New("invalid catalog district")
		}
		seen[d.Code] = true
	}
	return nil
}

type Ballot struct {
	SchemaVersion int               `json:"schema_version"`
	ElectionID    string            `json:"election_id"`
	District      District          `json:"district"`
	Parties       []json.RawMessage `json:"parties"`
	Candidacies   []Candidacy       `json:"candidacies"`
}

func (s Store) Ballot(code string) (Ballot, error) {
	var data Ballot
	if !ValidID(s.ElectionID) || !ValidID(code) {
		return data, errors.New("invalid ballot selection")
	}
	err := readJSON(filepath.Join(s.electionFolder(), "ballots", code+".json"), &data)
	if errors.Is(err, os.ErrNotExist) {
		legacy, err := s.District(code)
		if err != nil {
			return data, err
		}
		data = Ballot{SchemaVersion: 1, ElectionID: s.ElectionID, District: legacy.District, Parties: legacy.Parties, Candidacies: legacy.Candidacies}
	} else if err != nil {
		return data, err
	}
	if data.SchemaVersion != 1 || data.ElectionID != s.ElectionID || data.District.Code != code || data.District.ID == "" || data.District.Name == "" || data.Candidacies == nil || data.Parties == nil {
		return data, errors.New("invalid ballot")
	}
	parties, err := entityIDs(data.Parties)
	if err != nil {
		return data, err
	}
	seen := map[string]bool{}
	for _, c := range data.Candidacies {
		if c.ID == "" || seen[c.ID] || c.BallotName == "" || c.ElectionID != s.ElectionID || c.DistrictID != data.District.ID {
			return data, errors.New("invalid ballot candidate")
		}
		seen[c.ID] = true
		if c.Affiliation == "party" {
			if c.PartyID == nil || !parties[*c.PartyID] {
				return data, errors.New("invalid ballot party")
			}
		} else if (c.Affiliation != "independent" && c.Affiliation != "unaffiliated") || c.PartyID != nil {
			return data, errors.New("invalid ballot affiliation")
		}
	}
	data.District.CandidateCount = len(data.Candidacies)
	return data, nil
}
