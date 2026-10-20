package publication

import (
	"errors"
	"path/filepath"
	"regexp"
)

type PartyIdentity struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Color       string   `json:"color"`
	TextColor   string   `json:"textColor"`
	BallotNames []string `json:"ballotNames"`
}
type PartyRegistry struct {
	SchemaVersion int             `json:"schema_version"`
	ElectionID    string          `json:"election_id"`
	Parties       []PartyIdentity `json:"parties"`
}

var colorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func textColor(color string) string {
	if color == "#c85316" {
		return "#ae4410"
	}
	return color
}
func (s Store) Parties() (PartyRegistry, error) {
	var data PartyRegistry
	if !ValidID(s.ElectionID) {
		return data, errors.New("invalid election ID")
	}
	if err := readJSON(filepath.Join(s.ContentDir, s.ElectionID, "parties.json"), &data); err != nil {
		return data, err
	}
	if data.SchemaVersion != 1 || data.ElectionID != s.ElectionID || len(data.Parties) == 0 {
		return data, errors.New("invalid party registry")
	}
	seen, aliases := map[string]bool{}, map[string]bool{}
	for i := range data.Parties {
		p := &data.Parties[i]
		if !ValidID(p.ID) || seen[p.ID] || p.Name == "" || !colorPattern.MatchString(p.Color) || len(p.BallotNames) == 0 {
			return data, errors.New("invalid party identity")
		}
		seen[p.ID] = true
		p.TextColor = textColor(p.Color)
		for _, name := range p.BallotNames {
			if name == "" || aliases[name] {
				return data, errors.New("invalid ballot alias")
			}
			aliases[name] = true
		}
	}
	return data, nil
}
