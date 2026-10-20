package publication

import "errors"

type comparisonGuide struct {
	SchemaVersion int    `json:"schema_version"`
	Scope         string `json:"scope"`
	Pillars       []struct {
		ID              string  `json:"id"`
		Label           string  `json:"label"`
		Description     string  `json:"description"`
		AlignmentStatus *string `json:"alignment_status"`
		AlignmentNote   string  `json:"alignment_note"`
		ComparisonCount int     `json:"comparison_count"`
	} `json:"pillars"`
}

func validateComparisonGuide(record politicalEnvelope) error {
	guide := record.ComparisonGuide
	if guide == nil {
		return nil
	} // Older publications remain readable.
	if guide.SchemaVersion != 1 || guide.Scope == "" || len(guide.Pillars) != len(pillarIDs) {
		return errors.New("invalid comparison guide")
	}
	counts := map[string]int{}
	tones := map[string]string{}
	if record.Alignment != nil && record.Alignment.ReviewStatus == "source_checked" {
		for _, finding := range record.Alignment.Findings {
			var tone string
			switch finding.Status {
			case "supports_commitment", "consistent_with_later_position":
				tone = "aligned"
			case "potential_tension":
				tone = "against"
			case "inconclusive":
				tone = "inconclusive"
			default:
				return errors.New("invalid comparison status")
			}
			counts[finding.PillarID]++
			previous := tones[finding.PillarID]
			if previous != "" && previous != tone {
				tone = "inconclusive"
			}
			tones[finding.PillarID] = tone
		}
	}
	for index, pillar := range guide.Pillars {
		if pillar.ID != pillarIDs[index] || pillar.Label == "" || pillar.Description == "" || pillar.AlignmentNote == "" || pillar.ComparisonCount != counts[pillar.ID] {
			return errors.New("comparison guide does not match reviewed findings")
		}
		if pillar.ComparisonCount == 0 {
			if pillar.AlignmentStatus != nil {
				return errors.New("unassessed pillar cannot have an alignment verdict")
			}
		} else if pillar.AlignmentStatus == nil || *pillar.AlignmentStatus != tones[pillar.ID] {
			return errors.New("pillar verdict does not match reviewed findings")
		}
	}
	return nil
}
