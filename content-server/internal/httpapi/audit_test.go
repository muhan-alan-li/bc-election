package httpapi

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCatalogAndBallotDoNotDependOnResearch(t *testing.T) {
	root := t.TempDir()
	election := filepath.Join(root, "synthetic")
	var district map[string]any
	json.Unmarshal([]byte(fixture), &district)
	ballot := map[string]any{"schema_version": 1, "election_id": "synthetic", "district": district["district"], "parties": district["parties"], "candidacies": district["candidacies"]}
	writeFixture(t, filepath.Join(election, "ballots/SYN.json"), ballot)
	writeFixture(t, filepath.Join(election, "catalog.json"), map[string]any{"schema_version": 1, "election_id": "synthetic", "districts": []any{district["district"]}})
	// Corrupt an archived record. Neither lightweight endpoint should read it.
	os.WriteFile(filepath.Join(election, "SYN.json"), []byte("invalid research"), 0644)
	handler := NewHandler(Config{DataDir: root, ElectionID: "synthetic"})
	for _, path := range []string{"/api/districts", "/api/districts/SYN/ballot"} {
		response := request(handler, path)
		if response.Code != 200 {
			t.Fatal(path, response.Code, response.Body.String())
		}
		for _, field := range []string{`"votes"`, `"disclosures"`, `"people"`} {
			if strings.Contains(response.Body.String(), field) {
				t.Fatal("research leaked", field)
			}
		}
	}
}

func TestVoterResourcesSurviveUnavailableEditorialGuide(t *testing.T) {
	handler, root := voterFixture(t)
	os.WriteFile(filepath.Join(root, "bc-provincial-2026/guide.json"), []byte("broken"), 0644)
	for _, path := range []string{"/api/parties", "/api/questionnaire", "/api/polling"} {
		if got := request(handler, path); got.Code != 200 {
			t.Fatal(path, got.Code, got.Body.String())
		}
	}
	if got := request(handler, "/api/guide"); got.Code != 503 {
		t.Fatal(got.Code)
	}
}

func TestGenerationSwitchPinsAllReadsAndRetainsRollback(t *testing.T) {
	root := t.TempDir()
	writeGeneration := func(id, name string) {
		folder := filepath.Join(root, "releases/synthetic", id)
		writeFixture(t, filepath.Join(folder, "manifest.json"), map[string]any{"schema_version": 1, "election_id": "synthetic", "generation": id})
		writeFixture(t, filepath.Join(folder, "data/synthetic/catalog.json"), map[string]any{"schema_version": 1, "election_id": "synthetic", "districts": []any{map[string]any{"id": "d", "official_code": "SYN", "name": name, "candidate_count": 1}}})
	}
	activate := func(id string) {
		writeFixture(t, filepath.Join(root, "active/synthetic.json"), map[string]any{"schema_version": 1, "election_id": "synthetic", "generation": id})
	}
	writeGeneration("first", "First release")
	writeGeneration("second", "Second release")
	handler := NewHandler(Config{DataDir: root, ElectionID: "synthetic"})
	for _, id := range []string{"first", "second", "first"} {
		activate(id)
		response := request(handler, "/api/districts")
		if response.Code != 200 || response.Header().Get("X-Publication-Generation") != id || !strings.Contains(strings.ToLower(response.Body.String()), id+" release") {
			t.Fatal(response.Code, response.Body.String())
		}
	}
	activate("../../bad")
	if got := request(handler, "/api/districts"); got.Code != 503 {
		t.Fatal("unsafe pointer accepted", got.Code)
	}
	if got := request(handler, "/health"); got.Code != 200 {
		t.Fatal("liveness depends on readiness")
	}
}

func TestSecurityHeadersAndReadiness(t *testing.T) {
	client := t.TempDir()
	os.MkdirAll(filepath.Join(client, "assets"), 0755)
	os.WriteFile(filepath.Join(client, "assets/app-ABCDEFGH.js"), []byte("export {};"), 0644)
	handler := NewHandler(Config{ClientDir: client, DataDir: t.TempDir(), ElectionID: "synthetic"})
	response := request(handler, "/assets/app-ABCDEFGH.js")
	if response.Header().Get("X-Content-Type-Options") != "nosniff" || !strings.Contains(response.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") || !strings.Contains(response.Header().Get("Cache-Control"), "immutable") {
		t.Fatal(response.Header())
	}
	if response := request(handler, "/ready"); response.Code != 503 {
		t.Fatal("incomplete publication ready", response.Code)
	}
}
