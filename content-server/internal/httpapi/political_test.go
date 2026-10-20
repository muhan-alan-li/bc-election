package httpapi

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func politicalFixture() map[string]any {
	return map[string]any{
		"schema_version": 1, "kind": "candidate_political_profile", "election_id": "synthetic", "id": "candidate-1", "person_id": "person-1",
		"ballot_name": "Alex Example", "actions": []any{map[string]any{"id": "vote-1", "date": "2024-01-01", "subject": "Housing Act", "stage": "2R", "position": "yea", "attribution_status": "reviewed"}},
		"policy_passages": []any{}, "documents": []any{},
	}
}

func alignmentFixture() map[string]any {
	pillars := []any{}
	for _, id := range []string{"housing", "healthcare", "affordability", "economy", "public_safety", "climate"} {
		pillar := map[string]any{"id": id, "label": id, "description": "Policy description", "takeaway": nil}
		if id == "housing" {
			pillar["takeaway"] = "A reviewed comparison."
		}
		pillars = append(pillars, pillar)
	}
	return map[string]any{
		"schema_version": 1, "kind": "candidate_alignment_analysis", "id": "candidate-1", "person_id": "person-1", "election_id": "synthetic", "review_status": "source_checked",
		"pillars": pillars, "findings": []any{map[string]any{
			"pillar_id": "housing", "actions": []any{map[string]any{"id": "vote-1", "date": "2024-01-01", "subject": "Housing Act", "stage": "2R", "position": "yea"}},
			"citations": []any{map[string]any{"quote": "Evidence", "source": map[string]any{"url": "https://example.org/evidence", "sha256": "hash"}}},
		}},
	}
}

func TestPoliticalEndpointsReloadAndRevalidate(t *testing.T) {
	root, content := t.TempDir(), t.TempDir()
	path := filepath.Join(root, "political", "synthetic", "candidates", "candidate-1.json")
	record := politicalFixture()
	record["alignment_analysis"] = alignmentFixture()
	writeFixture(t, path, record)
	copyPath := filepath.Join(content, "synthetic", "candidate-copy.json")
	copy := map[string]any{"schema_version": 1, "election_id": "synthetic", "candidates": map[string]any{"candidate-1": map[string]any{"alignment_notes": map[string]any{"housing": "Editorial note"}}}}
	writeFixture(t, copyPath, copy)
	handler := NewHandler(Config{ClientDir: t.TempDir(), DataDir: root, ElectionID: "synthetic", FinderURL: "http://localhost:8001", ContentDir: content})
	first := request(handler, "/api/political/candidates/candidate-1")
	if first.Code != 200 || !strings.Contains(first.Body.String(), "Editorial note") || !strings.Contains(first.Body.String(), "Housing Act") {
		t.Fatal(first.Code, first.Body.String())
	}
	req := httptest.NewRequest(http.MethodGet, "/api/political/candidates/candidate-1", nil)
	req.Header.Set("If-None-Match", first.Header().Get("ETag"))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if response.Code != http.StatusNotModified {
		t.Fatal(response.Code)
	}
	copy["candidates"] = map[string]any{"candidate-1": map[string]any{"alignment_notes": map[string]any{"housing": "Updated note"}}}
	writeFixture(t, copyPath, copy)
	updated := request(handler, "/api/political/candidates/candidate-1")
	if !strings.Contains(updated.Body.String(), "Updated note") || updated.Header().Get("ETag") == first.Header().Get("ETag") {
		t.Fatal(updated.Body.String())
	}
	record["ballot_name"] = "Updated Example"
	writeFixture(t, path, record)
	if response := request(handler, "/api/political/candidates/candidate-1"); !strings.Contains(response.Body.String(), "Updated Example") {
		t.Fatal(response.Body.String())
	}
	for _, url := range []string{"/api/political/candidates/missing", "/api/political/unknown/candidate-1", "/api/political/candidates/bad%2Fpath"} {
		if response := request(handler, url); response.Code != 404 {
			t.Fatal(url, response.Code)
		}
	}
	party := map[string]any{"schema_version": 1, "kind": "party_political_platform", "election_id": "synthetic", "id": "party-1", "policy_passages": []any{}}
	writeFixture(t, filepath.Join(root, "political", "synthetic", "parties", "party-1.json"), party)
	if response := request(handler, "/api/political/parties/party-1"); response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
}

func TestPoliticalEndpointsRejectUnpublishedEvidence(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"wrong election", func(r map[string]any) { r["election_id"] = "wrong" }},
		{"wrong kind", func(r map[string]any) { r["kind"] = "candidate_platform" }},
		{"unreviewed attribution", func(r map[string]any) { r["actions"].([]any)[0].(map[string]any)["attribution_status"] = "suggested" }},
		{"raw research", func(r map[string]any) { r["documents"] = []any{map[string]any{"pages": []any{"private research"}}} }},
		{"draft comparisons", func(r map[string]any) {
			a := alignmentFixture()
			a["review_status"] = "draft"
			r["alignment_analysis"] = a
		}},
		{"altered vote", func(r map[string]any) {
			a := alignmentFixture()
			a["findings"].([]any)[0].(map[string]any)["actions"].([]any)[0].(map[string]any)["position"] = "nay"
			r["alignment_analysis"] = a
		}},
		{"unknown pillar", func(r map[string]any) {
			a := alignmentFixture()
			a["findings"].([]any)[0].(map[string]any)["pillar_id"] = "invented"
			r["alignment_analysis"] = a
		}},
		{"unconfirmed issue scope", func(r map[string]any) {
			r["issue_analysis"] = map[string]any{"id": "candidate-1", "person_id": "person-1", "election_id": "synthetic", "review_status": "machine_generated_needs_review", "coverage": map[string]any{"scope": "includes_unconfirmed_attribution_leads"}, "issue_findings": []any{}}
		}},
		{"unknown issue action", func(r map[string]any) {
			r["issue_analysis"] = map[string]any{"id": "candidate-1", "person_id": "person-1", "election_id": "synthetic", "review_status": "machine_generated_needs_review", "coverage": map[string]any{"scope": "reviewed_attributions"}, "issue_findings": []any{map[string]any{"evidence": []any{map[string]any{"action_id": "missing", "attribution_status": "reviewed"}}}}}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			record := politicalFixture()
			tc.mutate(record)
			writeFixture(t, filepath.Join(root, "political", "synthetic", "candidates", "candidate-1.json"), record)
			handler := NewHandler(Config{ClientDir: t.TempDir(), DataDir: root, ElectionID: "synthetic"})
			response := request(handler, "/api/political/candidates/candidate-1")
			if response.Code != 503 || strings.Contains(response.Body.String(), "private research") {
				t.Fatal(response.Code, response.Body.String())
			}
		})
	}
}
