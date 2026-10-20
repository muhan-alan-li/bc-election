package publication

var pillarIDs = [...]string{"housing", "healthcare", "affordability", "economy", "public_safety", "climate"}

type politicalAction struct {
	ID                string `json:"id"`
	Date              string `json:"date"`
	Subject           string `json:"subject"`
	Stage             string `json:"stage"`
	Position          string `json:"position"`
	AttributionStatus string `json:"attribution_status"`
}

type politicalEnvelope struct {
	SchemaVersion   int               `json:"schema_version"`
	Kind            string            `json:"kind"`
	ID              string            `json:"id"`
	PersonID        string            `json:"person_id"`
	ElectionID      string            `json:"election_id"`
	Actions         []politicalAction `json:"actions"`
	ComparisonGuide *comparisonGuide  `json:"comparison_guide"`
	IssueAnalysis   *struct {
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
			Status    string            `json:"status"`
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
