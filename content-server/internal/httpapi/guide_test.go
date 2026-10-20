package httpapi

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestGuideEndpointsReloadAndRejectInvalidContent(t *testing.T) {
	content := t.TempDir()
	path := filepath.Join(content, "synthetic", "guide.json")
	guide := map[string]any{"schema_version": 1, "election_id": "synthetic", "reviewedOn": "Reviewed today", "partyRosterSource": "https://example.org", "parties": []any{}, "otherParties": []any{}}
	writeFixture(t, path, guide)
	handler := NewHandler(Config{ClientDir: t.TempDir(), DataDir: t.TempDir(), ElectionID: "synthetic", FinderURL: "http://localhost:8001", ContentDir: content})
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
	guide["parties"] = []any{map[string]any{"id": "party", "name": "Example", "color": "#123456", "leader": "Alex", "leaderNote": "Leader", "leaderSource": "https://example.org", "platform": "https://example.org/platform", "status": "Selected commitments", "items": []any{map[string]any{"topic": "Housing", "summary": "Summary", "points": []any{map[string]any{"text": "Action", "sourceIndices": []int{1}}}, "sources": []any{map[string]any{"url": "https://example.org", "label": "Source"}}}}}}
	writeFixture(t, path, guide)
	if response := request(handler, "/api/guide"); response.Code != 503 {
		t.Fatal("invalid citation index was served", response.Code)
	}
}
