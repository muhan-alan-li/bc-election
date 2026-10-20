package publication

import (
	"encoding/json"
	"testing"
)

func TestUnassessedGuideCannotClaimAlignment(t *testing.T) {
	pillars := []map[string]any{}
	for _, id := range pillarIDs {
		pillars = append(pillars, map[string]any{"id": id, "label": id, "description": "Policy focus", "alignment_note": "No comparisons yet", "comparison_count": 0, "alignment_status": nil})
	}
	guide := map[string]any{"schema_version": 1, "scope": "Compare promises and actions", "pillars": pillars}
	validate := func() error {
		body, _ := json.Marshal(map[string]any{"comparison_guide": guide})
		var record politicalEnvelope
		if err := json.Unmarshal(body, &record); err != nil {
			t.Fatal(err)
		}
		return validateComparisonGuide(record)
	}
	if err := validate(); err != nil {
		t.Fatal(err)
	}
	pillars[0]["alignment_status"] = "aligned"
	if err := validate(); err == nil {
		t.Fatal("unassessed pillar claimed alignment")
	}
	pillars[0]["alignment_status"] = nil
	pillars[0]["comparison_count"] = 1
	if err := validate(); err == nil {
		t.Fatal("guide claimed a nonexistent comparison")
	}
}
