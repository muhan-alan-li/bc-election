package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

var pillarIDs = []string{"housing", "healthcare", "affordability", "economy", "public_safety", "climate"}

type politicalAction struct {
	ID                string `json:"id"`
	Date              string `json:"date"`
	Subject           string `json:"subject"`
	Stage             string `json:"stage"`
	Position          string `json:"position"`
	AttributionStatus string `json:"attribution_status"`
}

type politicalEnvelope struct {
	SchemaVersion int               `json:"schema_version"`
	Kind          string            `json:"kind"`
	ID            string            `json:"id"`
	PersonID      string            `json:"person_id"`
	ElectionID    string            `json:"election_id"`
	Actions       []politicalAction `json:"actions"`
	IssueAnalysis *struct {
		ID           string `json:"id"`
		PersonID     string `json:"person_id"`
		ElectionID   string `json:"election_id"`
		ReviewStatus string `json:"review_status"`
		Coverage     struct {
			Scope string `json:"scope"`
		} `json:"coverage"`
		Findings []struct {
			Evidence []struct {
				ActionID          string `json:"action_id"`
				AttributionStatus string `json:"attribution_status"`
			} `json:"evidence"`
		} `json:"issue_findings"`
	} `json:"issue_analysis"`
	Alignment *struct {
		SchemaVersion int    `json:"schema_version"`
		Kind          string `json:"kind"`
		ID            string `json:"id"`
		PersonID      string `json:"person_id"`
		ElectionID    string `json:"election_id"`
		ReviewStatus  string `json:"review_status"`
		Pillars       []struct {
			ID          string  `json:"id"`
			Label       string  `json:"label"`
			Description string  `json:"description"`
			Takeaway    *string `json:"takeaway"`
		} `json:"pillars"`
		Unassessed []struct {
			PillarID string `json:"pillar_id"`
		} `json:"unassessed_commitments"`
		Findings []struct {
			PillarID  string            `json:"pillar_id"`
			Actions   []politicalAction `json:"actions"`
			Citations []struct {
				Quote  string `json:"quote"`
				Source struct {
					SHA256 string `json:"sha256"`
					URL    string `json:"url"`
				} `json:"source"`
			} `json:"citations"`
		} `json:"findings"`
	} `json:"alignment_analysis"`
}

func loadPolitical(dataDir, electionID, kind, id string) (map[string]json.RawMessage, error) {
	body, err := os.ReadFile(filepath.Join(dataDir, "political", electionID, kind, id+".json"))
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
	if record.SchemaVersion != 1 || record.Kind != expectedKind || record.ID != id || record.ElectionID != electionID || containsResearchFields(value) {
		return nil, errors.New("invalid public political profile")
	}
	actions := map[string]politicalAction{}
	for _, action := range record.Actions {
		if action.ID == "" || action.AttributionStatus != "reviewed" {
			return nil, errors.New("unreviewed attribution")
		}
		if _, exists := actions[action.ID]; exists {
			return nil, errors.New("duplicate action")
		}
		actions[action.ID] = action
	}
	if analysis := record.IssueAnalysis; analysis != nil {
		if analysis.ID != record.ID || analysis.PersonID != record.PersonID || analysis.ElectionID != record.ElectionID || analysis.Coverage.Scope != "reviewed_attributions" || analysis.ReviewStatus != "machine_generated_needs_review" || analysis.Findings == nil {
			return nil, errors.New("invalid public issue analysis")
		}
		for _, finding := range analysis.Findings {
			if finding.Evidence == nil {
				return nil, errors.New("missing issue evidence")
			}
			for _, evidence := range finding.Evidence {
				if _, exists := actions[evidence.ActionID]; !exists || evidence.AttributionStatus != "reviewed" {
					return nil, errors.New("invalid issue evidence")
				}
			}
		}
	}
	if analysis := record.Alignment; analysis != nil {
		if analysis.SchemaVersion != 1 || analysis.Kind != "candidate_alignment_analysis" || analysis.ID != record.ID || analysis.PersonID != record.PersonID || analysis.ElectionID != record.ElectionID || analysis.ReviewStatus != "source_checked" || len(analysis.Findings) == 0 || len(analysis.Pillars) != len(pillarIDs) {
			return nil, errors.New("invalid public platform alignment")
		}
		assessed := map[string]bool{}
		for _, finding := range analysis.Findings {
			if !slices.Contains(pillarIDs, finding.PillarID) || len(finding.Actions) == 0 || len(finding.Citations) == 0 {
				return nil, errors.New("invalid alignment finding")
			}
			assessed[finding.PillarID] = true
			for _, action := range finding.Actions {
				current, exists := actions[action.ID]
				if !exists || current.Date != action.Date || current.Subject != action.Subject || current.Stage != action.Stage || current.Position != action.Position {
					return nil, errors.New("altered alignment vote")
				}
			}
			for _, citation := range finding.Citations {
				if citation.Quote == "" || citation.Source.SHA256 == "" || !strings.HasPrefix(citation.Source.URL, "https://") {
					return nil, errors.New("invalid alignment citation")
				}
			}
		}
		for index, pillar := range analysis.Pillars {
			if pillar.ID != pillarIDs[index] || pillar.Label == "" || pillar.Description == "" {
				return nil, errors.New("invalid alignment pillars")
			}
			if assessed[pillar.ID] {
				if pillar.Takeaway == nil || strings.TrimSpace(*pillar.Takeaway) == "" {
					return nil, errors.New("missing pillar takeaway")
				}
			} else if pillar.Takeaway != nil {
				return nil, errors.New("unassessed pillar takeaway")
			}
		}
		for _, item := range analysis.Unassessed {
			if !slices.Contains(pillarIDs, item.PillarID) {
				return nil, errors.New("invalid unassessed pillar")
			}
		}
	}
	return public, nil
}

func registerPolitical(mux *http.ServeMux, dataDir, contentDir, electionID string) {
	mux.HandleFunc("GET /api/political/{kind}/{id}", func(w http.ResponseWriter, r *http.Request) {
		kind, id := r.PathValue("kind"), r.PathValue("id")
		if !safeID.MatchString(electionID) || !safeID.MatchString(id) || (kind != "candidates" && kind != "parties") {
			apiError(w, 404, "Political record not found.")
			return
		}
		record, err := loadPolitical(dataDir, electionID, kind, id)
		if errors.Is(err, os.ErrNotExist) {
			apiError(w, 404, "Political record not found.")
			return
		}
		if err != nil {
			apiError(w, 503, "Published political data needs attention.")
			return
		}
		if kind == "candidates" {
			copy, err := loadCandidateCopy(contentDir, electionID, id)
			if err != nil {
				apiError(w, 503, "Candidate display content needs attention.")
				return
			}
			if copy != nil {
				record["presentation"] = copy
			}
		}
		writeJSON(w, r, record)
	})
}
