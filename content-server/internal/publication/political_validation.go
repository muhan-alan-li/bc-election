package publication

import (
	"errors"
	"slices"
	"strings"
)

func reviewedActions(records []politicalAction) (map[string]politicalAction, error) {
	actions := map[string]politicalAction{}
	for _, action := range records {
		if action.ID == "" || action.AttributionStatus != "reviewed" {
			return nil, errors.New("unreviewed attribution")
		}
		if _, exists := actions[action.ID]; exists {
			return nil, errors.New("duplicate action")
		}
		actions[action.ID] = action
	}
	return actions, nil
}

func validateIssues(record politicalEnvelope, actions map[string]politicalAction) error {
	if analysis := record.IssueAnalysis; analysis != nil {
		if analysis.ID != record.ID || analysis.PersonID != record.PersonID || analysis.ElectionID != record.ElectionID || analysis.Coverage.Scope != "reviewed_attributions" || analysis.ReviewStatus != "machine_generated_needs_review" || analysis.Findings == nil {
			return errors.New("invalid public issue analysis")
		}
		for _, finding := range analysis.Findings {
			if finding.Evidence == nil {
				return errors.New("missing issue evidence")
			}
			for _, evidence := range finding.Evidence {
				if _, exists := actions[evidence.ActionID]; !exists || evidence.AttributionStatus != "reviewed" {
					return errors.New("invalid issue evidence")
				}
			}
		}
	}
	return nil
}

func validateAlignment(record politicalEnvelope, actions map[string]politicalAction) error {
	if analysis := record.Alignment; analysis != nil {
		if analysis.SchemaVersion != 1 || analysis.Kind != "candidate_alignment_analysis" || analysis.ID != record.ID || analysis.PersonID != record.PersonID || analysis.ElectionID != record.ElectionID || analysis.ReviewStatus != "source_checked" || len(analysis.Findings) == 0 || len(analysis.Pillars) != len(pillarIDs) {
			return errors.New("invalid public platform alignment")
		}
		assessed := map[string]bool{}
		for _, finding := range analysis.Findings {
			if !slices.Contains(pillarIDs[:], finding.PillarID) || len(finding.Actions) == 0 || len(finding.Citations) == 0 {
				return errors.New("invalid alignment finding")
			}
			assessed[finding.PillarID] = true
			for _, action := range finding.Actions {
				current, exists := actions[action.ID]
				if !exists || current.Date != action.Date || current.Subject != action.Subject || current.Stage != action.Stage || current.Position != action.Position {
					return errors.New("altered alignment vote")
				}
			}
			for _, citation := range finding.Citations {
				if citation.Quote == "" || citation.Source.SHA256 == "" || !strings.HasPrefix(citation.Source.URL, "https://") {
					return errors.New("invalid alignment citation")
				}
			}
		}
		for index, pillar := range analysis.Pillars {
			if pillar.ID != pillarIDs[index] || pillar.Label == "" || pillar.Description == "" {
				return errors.New("invalid alignment pillars")
			}
			if assessed[pillar.ID] {
				if pillar.Takeaway == nil || strings.TrimSpace(*pillar.Takeaway) == "" {
					return errors.New("missing pillar takeaway")
				}
			} else if pillar.Takeaway != nil {
				return errors.New("unassessed pillar takeaway")
			}
		}
		for _, item := range analysis.Unassessed {
			if !slices.Contains(pillarIDs[:], item.PillarID) {
				return errors.New("invalid unassessed pillar")
			}
		}
	}
	return nil
}
