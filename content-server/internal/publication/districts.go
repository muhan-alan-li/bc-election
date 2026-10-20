package publication

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type District struct {
	ID             string `json:"id"`
	Code           string `json:"official_code"`
	Name           string `json:"name"`
	RosterStatus   string `json:"roster_status"`
	CandidateCount int    `json:"candidate_count"`
}

// Expose the public dataset, excluding collection tasks, identity leads and cache paths.
type Candidacy struct {
	ID          string          `json:"id"`
	PersonID    string          `json:"person_id"`
	ElectionID  string          `json:"election_id"`
	DistrictID  string          `json:"district_id"`
	BallotName  string          `json:"ballot_name"`
	PartyID     *string         `json:"party_id"`
	Affiliation string          `json:"affiliation"`
	Status      string          `json:"status"`
	Source      json.RawMessage `json:"source"`
}

type Dataset struct {
	SchemaVersion int    `json:"schema_version"`
	GeneratedAt   string `json:"generated_at"`
	Election      struct {
		ID         string  `json:"id"`
		Title      string  `json:"title"`
		VotingDate *string `json:"voting_date"`
		SourceURL  string  `json:"source_url"`
	} `json:"election"`
	District    District          `json:"district"`
	People      []json.RawMessage `json:"people"`
	Parties     []json.RawMessage `json:"parties"`
	Candidacies []Candidacy       `json:"candidacies"`
	Votes       []json.RawMessage `json:"votes"`
	Disclosures []json.RawMessage `json:"disclosures"`
	Interests   []json.RawMessage `json:"interests"`
	Coverage    []json.RawMessage `json:"coverage"`
}

func (s Store) District(code string) (Dataset, error) {
	var data Dataset
	if !ValidID(s.ElectionID) || !ValidID(code) {
		return data, errors.New("invalid constituency selection")
	}
	if err := readJSON(filepath.Join(s.electionFolder(), code+".json"), &data); err != nil {
		return data, err
	}
	if data.SchemaVersion != 2 || data.Election.ID != s.ElectionID || data.District.Code != code || data.District.ID == "" || data.District.Name == "" {
		return data, errors.New("invalid constituency dataset envelope")
	}
	if data.People == nil || data.Parties == nil || data.Candidacies == nil || data.Votes == nil || data.Disclosures == nil || data.Interests == nil || data.Coverage == nil {
		return data, errors.New("missing dataset arrays")
	}
	people, err := entityIDs(data.People)
	if err != nil {
		return data, err
	}
	parties, err := entityIDs(data.Parties)
	if err != nil {
		return data, err
	}
	seen := map[string]bool{}
	for _, candidate := range data.Candidacies {
		if candidate.ID == "" || seen[candidate.ID] || candidate.BallotName == "" || !people[candidate.PersonID] || candidate.ElectionID != s.ElectionID || candidate.DistrictID != data.District.ID {
			return data, errors.New("invalid candidacy references")
		}
		seen[candidate.ID] = true
		switch candidate.Affiliation {
		case "party":
			if candidate.PartyID == nil || !parties[*candidate.PartyID] {
				return data, errors.New("invalid party reference")
			}
		case "independent", "unaffiliated":
			if candidate.PartyID != nil {
				return data, errors.New("unexpected party reference")
			}
		default:
			return data, errors.New("invalid affiliation")
		}
	}
	for _, records := range [][]json.RawMessage{data.Votes, data.Disclosures, data.Interests, data.Coverage} {
		for _, raw := range records {
			var record struct {
				PersonID string `json:"person_id"`
			}
			if json.Unmarshal(raw, &record) != nil || !people[record.PersonID] {
				return data, errors.New("invalid record person reference")
			}
		}
	}
	data.District.CandidateCount = len(data.Candidacies)
	return data, nil
}

func entityIDs(records []json.RawMessage) (map[string]bool, error) {
	ids := map[string]bool{}
	for _, raw := range records {
		var entity struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(raw, &entity) != nil || entity.ID == "" || ids[entity.ID] {
			return nil, errors.New("invalid or duplicate entity ID")
		}
		ids[entity.ID] = true
	}
	return ids, nil
}

// ErrCatalogUnavailable identifies failures opening the publication catalog.
var ErrCatalogUnavailable = errors.New("constituency catalog unavailable")

// Districts returns a sorted catalog, failing if any published district is invalid.
func (s Store) Districts() ([]District, error) {
	if !ValidID(s.ElectionID) {
		return nil, errors.New("invalid election ID")
	}
	var catalog Catalog
	err := readJSON(filepath.Join(s.electionFolder(), "catalog.json"), &catalog)
	if err == nil {
		if err := catalog.validate(s.ElectionID); err != nil {
			return nil, err
		}
		return catalog.Districts, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	entries, err := os.ReadDir(s.electionFolder())
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, errors.Join(ErrCatalogUnavailable, err)
	}
	result := []District{}
	for _, entry := range entries {
		code := strings.TrimSuffix(entry.Name(), ".json")
		if entry.Name() == "catalog.json" || entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") || !ValidID(code) {
			continue
		}
		data, err := s.District(code)
		if err != nil {
			return nil, err
		}
		result = append(result, data.District)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result, nil
}
