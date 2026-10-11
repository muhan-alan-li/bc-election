package main

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func TestReviewedGuideContent(t *testing.T) {
	guide, err := loadGuide("content", "bc-provincial-2026")
	if err != nil {
		t.Fatal(err)
	}
	policies := 0
	for _, raw := range append(guide.Parties, guide.OtherParties...) {
		var party struct {
			Items []json.RawMessage `json:"items"`
		}
		if err := json.Unmarshal(raw, &party); err != nil {
			t.Fatal(err)
		}
		policies += len(party.Items)
	}
	if policies != 53 || len(guide.Parties) != 3 || len(guide.OtherParties) != 7 {
		t.Fatal("unexpected guide coverage", policies)
	}
}

func TestGuideEndpointsReloadAndRejectInvalidContent(t *testing.T) {
	content := t.TempDir()
	path := filepath.Join(content, "synthetic", "guide.json")
	guide := map[string]any{"schema_version": 1, "election_id": "synthetic", "reviewedOn": "Reviewed today", "partyRosterSource": "https://example.org", "parties": []any{}, "otherParties": []any{}}
	writeFixture(t, path, guide)
	handler := newHandler(t.TempDir(), t.TempDir(), "synthetic", "http://localhost:8001", content)
	first := request(handler, "/api/guide")
	if first.Code != 200 || !strings.Contains(first.Body.String(), "Reviewed today") {
		t.Fatal(first.Code, first.Body.String())
	}
	guide["reviewedOn"] = "Updated date"
	writeFixture(t, path, guide)
	updated := request(handler, "/api/guide")
	if updated.Code != 200 || !strings.Contains(updated.Body.String(), "Updated date") || updated.Header().Get("ETag") == first.Header().Get("ETag") {
		t.Fatal(updated.Code, updated.Body.String())
	}
	guide["election_id"] = "wrong"
	writeFixture(t, path, guide)
	if response := request(handler, "/api/guide"); response.Code != 503 {
		t.Fatal(response.Code)
	}
	guide["election_id"] = "synthetic"
	guide["parties"] = []any{map[string]any{"id": "party", "name": "Example", "items": []any{map[string]any{"topic": "Housing", "summary": "Summary", "points": []any{map[string]any{"text": "Action", "sourceIndices": []int{1}}}, "sources": []any{map[string]any{"url": "https://example.org", "label": "Source"}}}}}}
	writeFixture(t, path, guide)
	if response := request(handler, "/api/guide"); response.Code != 503 {
		t.Fatal("invalid citation index was served", response.Code)
	}
}
