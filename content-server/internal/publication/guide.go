package publication

import (
	"errors"
	"path/filepath"
	"strings"
)

type PolicyPoint struct {
	Text          string `json:"text"`
	SourceIndices []int  `json:"sourceIndices"`
}
type PolicyItem struct {
	Topic   string        `json:"topic"`
	Summary string        `json:"summary"`
	Note    string        `json:"note,omitempty"`
	Points  []PolicyPoint `json:"points"`
	Sources []VoterSource `json:"sources"`
}
type GuideParty struct {
	ID               string       `json:"id"`
	Name             string       `json:"name"`
	Color            string       `json:"color"`
	TextColor        string       `json:"textColor"`
	Leader           string       `json:"leader"`
	LeaderSource     string       `json:"leaderSource"`
	LeaderNote       string       `json:"leaderNote"`
	Platform         string       `json:"platform"`
	Status           string       `json:"status"`
	Note             string       `json:"note,omitempty"`
	Portrait         string       `json:"portrait,omitempty"`
	PortraitSource   string       `json:"portraitSource,omitempty"`
	PortraitPosition string       `json:"portraitPosition,omitempty"`
	Items            []PolicyItem `json:"items"`
}
type Guide struct {
	SchemaVersion     int          `json:"schema_version"`
	ElectionID        string       `json:"election_id"`
	ReviewedOn        string       `json:"reviewedOn"`
	PartyRosterSource string       `json:"partyRosterSource"`
	Parties           []GuideParty `json:"parties"`
	OtherParties      []GuideParty `json:"otherParties"`
}

func validURL(value string) bool { return validVoterSource(VoterSource{URL: value, Label: "source"}) }
func (s Store) Guide() (Guide, error) {
	var guide Guide
	if !ValidID(s.ElectionID) {
		return guide, errors.New("invalid election ID")
	}
	if err := readJSON(filepath.Join(s.ContentDir, s.ElectionID, "guide.json"), &guide); err != nil {
		return guide, err
	}
	if guide.SchemaVersion != 1 || guide.ElectionID != s.ElectionID || guide.Parties == nil || guide.OtherParties == nil || guide.ReviewedOn == "" || !validURL(guide.PartyRosterSource) {
		return guide, errors.New("invalid guide content")
	}
	seen := map[string]bool{}
	for _, group := range [][]GuideParty{guide.Parties, guide.OtherParties} {
		for i := range group {
			party := &group[i]
			if !ValidID(party.ID) || seen[party.ID] || party.Name == "" || party.Items == nil || !colorPattern.MatchString(party.Color) || party.Leader == "" || party.LeaderNote == "" || party.Status == "" || !validURL(party.LeaderSource) || !validURL(party.Platform) {
				return guide, errors.New("invalid party guide")
			}
			seen[party.ID] = true
			party.TextColor = textColor(party.Color)
			if party.Portrait != "" && (!strings.HasPrefix(party.Portrait, "/content/assets/leaders/") || strings.Contains(party.Portrait, "..") || strings.ContainsAny(party.Portrait, "?#\\") || !validURL(party.PortraitSource)) {
				return guide, errors.New("invalid portrait")
			}
			for _, item := range party.Items {
				if item.Topic == "" || item.Summary == "" || len(item.Points) == 0 || len(item.Sources) == 0 {
					return guide, errors.New("invalid policy item")
				}
				for _, source := range item.Sources {
					if !validVoterSource(source) {
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
	}
	return guide, nil
}
