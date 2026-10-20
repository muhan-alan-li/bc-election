package publication

import (
	"testing"
)

func TestReviewedGuideContent(t *testing.T) {
	guide, err := (Store{ContentDir: "../../content", ElectionID: "bc-provincial-2026"}).Guide()
	if err != nil {
		t.Fatal(err)
	}
	policies := 0
	for _, party := range append(guide.Parties, guide.OtherParties...) {
		policies += len(party.Items)
	}
	if policies != 53 || len(guide.Parties) != 3 || len(guide.OtherParties) != 7 {
		t.Fatal("unexpected guide coverage", policies)
	}
}
