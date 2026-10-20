package publication

import (
	"errors"
	"math"
	"net/url"
	"path/filepath"
	"time"
)

type VoterSource struct {
	URL   string `json:"url"`
	Label string `json:"label"`
}
type PartyStance struct {
	PartyID   string      `json:"partyID"`
	Side      string      `json:"side"`
	Summary   string      `json:"summary"`
	Source    VoterSource `json:"source"`
	CheckedOn string      `json:"checkedOn"`
}
type PartyQuestion struct {
	ID      string        `json:"id"`
	Topic   string        `json:"topic"`
	Prompt  string        `json:"prompt"`
	Yes     string        `json:"yes"`
	No      string        `json:"no"`
	Note    string        `json:"note"`
	Stances []PartyStance `json:"stances"`
}
type BallotParty struct {
	ID          string   `json:"id"`
	BallotNames []string `json:"ballotNames"`
}
type Questionnaire struct {
	SchemaVersion int             `json:"schema_version"`
	ElectionID    string          `json:"election_id"`
	ReviewedOn    string          `json:"reviewedOn"`
	Methodology   string          `json:"methodology"`
	Parties       []BallotParty   `json:"parties"`
	Questions     []PartyQuestion `json:"questions"`
}
type RidingOutlook struct {
	Code          string      `json:"code"`
	Name          string      `json:"name"`
	Kind          string      `json:"kind"`
	LeaderPartyID *string     `json:"leaderPartyID"`
	Outlook       string      `json:"outlook"`
	AsOf          string      `json:"asOf"`
	Source        VoterSource `json:"source"`
}
type PollResult struct {
	PartyID string  `json:"partyID"`
	Share   float64 `json:"share"`
}
type ProvincialSurvey struct {
	ID             string       `json:"id"`
	Pollster       string       `json:"pollster"`
	Kind           string       `json:"kind"`
	Scope          string       `json:"scope"`
	PublishedOn    string       `json:"publishedOn"`
	FieldworkStart string       `json:"fieldworkStart"`
	FieldworkEnd   string       `json:"fieldworkEnd"`
	SampleSize     int          `json:"sampleSize"`
	Method         string       `json:"method"`
	Population     string       `json:"population"`
	Uncertainty    string       `json:"uncertainty"`
	Source         VoterSource  `json:"source"`
	Results        []PollResult `json:"results"`
}
type Polling struct {
	SchemaVersion int                `json:"schema_version"`
	ElectionID    string             `json:"election_id"`
	CollectedAt   string             `json:"collectedAt"`
	Methodology   VoterSource        `json:"methodology"`
	Districts     []RidingOutlook    `json:"districts"`
	Surveys       []ProvincialSurvey `json:"surveys"`
}

func validVoterDate(value string) bool {
	_, err := time.Parse("2006-01-02", value)
	return err == nil && value <= time.Now().UTC().Format("2006-01-02")
}
func validVoterSource(source VoterSource) bool {
	u, err := url.Parse(source.URL)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != "" && u.User == nil && source.Label != ""
}
func (s Store) voterPartyIDs() (map[string]bool, error) {
	registry, err := s.Parties()
	if err != nil {
		return nil, err
	}
	ids := map[string]bool{}
	for _, party := range registry.Parties {
		ids[party.ID] = true
	}
	return ids, nil
}
func (s Store) Questionnaire() (Questionnaire, error) {
	var data Questionnaire
	ids, err := s.voterPartyIDs()
	if err != nil {
		return data, err
	}
	if err := readJSON(filepath.Join(s.ContentDir, s.ElectionID, "questionnaire.json"), &data); err != nil {
		return data, err
	}
	if data.SchemaVersion != 1 || data.ElectionID != s.ElectionID || !validVoterDate(data.ReviewedOn) || data.Methodology == "" || len(data.Questions) == 0 || len(data.Parties) != len(ids) {
		return data, errors.New("invalid questionnaire")
	}
	seen := map[string]bool{}
	aliases := map[string]bool{}
	for _, party := range data.Parties {
		if !ids[party.ID] || seen[party.ID] || len(party.BallotNames) == 0 {
			return data, errors.New("invalid ballot party")
		}
		seen[party.ID] = true
		for _, name := range party.BallotNames {
			if name == "" || aliases[name] {
				return data, errors.New("duplicate ballot alias")
			}
			aliases[name] = true
		}
	}
	seen = map[string]bool{}
	for _, q := range data.Questions {
		if !ValidID(q.ID) || seen[q.ID] || q.Topic == "" || q.Prompt == "" || q.Yes == "" || q.No == "" || q.Note == "" || len(q.Stances) == 0 {
			return data, errors.New("invalid question")
		}
		seen[q.ID] = true
		parties := map[string]bool{}
		for _, stance := range q.Stances {
			if !ids[stance.PartyID] || parties[stance.PartyID] || (stance.Side != "yes" && stance.Side != "no") || stance.Summary == "" || !validVoterDate(stance.CheckedOn) || !validVoterSource(stance.Source) {
				return data, errors.New("invalid or conflicting party stance")
			}
			parties[stance.PartyID] = true
		}
	}
	return data, nil
}
func (s Store) Polling() (Polling, error) {
	var data Polling
	ids, err := s.voterPartyIDs()
	if err != nil {
		return data, err
	}
	ids["other"] = true
	if err := readJSON(filepath.Join(s.ContentDir, s.ElectionID, "polling.json"), &data); err != nil {
		return data, err
	}
	_, dateErr := time.Parse(time.RFC3339Nano, data.CollectedAt)
	if data.SchemaVersion != 1 || data.ElectionID != s.ElectionID || dateErr != nil || !validVoterSource(data.Methodology) || data.Districts == nil || data.Surveys == nil {
		return data, errors.New("invalid polling content")
	}
	seen := map[string]bool{}
	for _, d := range data.Districts {
		if !ValidID(d.Code) || seen[d.Code] || d.Name == "" || d.Kind != "projection" || !validVoterDate(d.AsOf) || !validVoterSource(d.Source) {
			return data, errors.New("invalid riding outlook")
		}
		seen[d.Code] = true
		if d.Outlook == "toss_up" {
			if d.LeaderPartyID != nil {
				return data, errors.New("toss up cannot name a leader")
			}
		} else if d.LeaderPartyID == nil || !ids[*d.LeaderPartyID] || *d.LeaderPartyID == "other" || (d.Outlook != "leaning" && d.Outlook != "likely" && d.Outlook != "safe") {
			return data, errors.New("invalid projection leader")
		}
	}
	seen = map[string]bool{}
	for _, p := range data.Surveys {
		if !ValidID(p.ID) || seen[p.ID] || p.Pollster == "" || p.Kind != "poll" || p.Scope != "province" || !validVoterDate(p.PublishedOn) || !validVoterDate(p.FieldworkStart) || !validVoterDate(p.FieldworkEnd) || p.FieldworkStart > p.FieldworkEnd || p.FieldworkEnd > p.PublishedOn || p.SampleSize <= 0 || p.Method == "" || p.Population == "" || p.Uncertainty == "" || !validVoterSource(p.Source) || len(p.Results) == 0 {
			return data, errors.New("invalid survey metadata")
		}
		seen[p.ID] = true
		parties := map[string]bool{}
		total := 0.0
		for _, r := range p.Results {
			if !ids[r.PartyID] || parties[r.PartyID] || math.IsNaN(r.Share) || r.Share < 0 || r.Share > 100 {
				return data, errors.New("invalid survey share")
			}
			parties[r.PartyID] = true
			total += r.Share
		}
		if total < 98 || total > 102 {
			return data, errors.New("invalid survey total")
		}
	}
	return data, nil
}
