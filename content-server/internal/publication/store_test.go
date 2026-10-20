package publication

import (
	"testing"
)

func TestStoreRejectsInvalidSelections(t *testing.T) {
	store := Store{DataDir: t.TempDir(), ContentDir: t.TempDir(), ElectionID: "synthetic"}
	for _, id := range []string{"", "../outside", "bad/path", "bad code"} {
		if _, err := store.District(id); err == nil {
			t.Fatalf("district accepted %q", id)
		}
		if _, err := store.Political("candidates", id); err == nil {
			t.Fatalf("political profile accepted %q", id)
		}
		if _, err := store.CandidateCopy(id); err == nil {
			t.Fatalf("candidate copy accepted %q", id)
		}
	}
	for _, kind := range []string{"", "../outside", "unknown"} {
		if _, err := store.Platforms(kind); err == nil {
			t.Fatalf("platforms accepted %q", kind)
		}
		if _, err := store.Political(kind, "candidate-1"); err == nil {
			t.Fatalf("political profile accepted kind %q", kind)
		}
	}
	store.ElectionID = "../outside"
	if _, err := store.Guide(); err == nil {
		t.Fatal("guide accepted invalid election")
	}
	if _, err := store.Districts(); err == nil {
		t.Fatal("catalog accepted invalid election")
	}
}
