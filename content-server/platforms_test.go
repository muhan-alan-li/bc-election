package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const candidatePlatformFixture = `{"schema_version":1,"kind":"candidate_platform","election_id":"synthetic","id":"candidate-platform-1","generated_at":"2026-10-08T00:00:00Z","ballot_name":"Alex Example","district_code":"SYN","affiliation":"independent","party_id":null,"party_platform_id":null,"roster_source":{"url":"https://example.org/roster"},"documents":[{"id":"document-1","source":{"url":"https://example.org/platform","sha256":"example-hash"}}],"commitments":[],"parsing_status":"not_run","coverage":{"status":"collected","errors":[]}}`

func TestPlatformEndpointsFilterRevalidateAndReload(t *testing.T) {
	root := t.TempDir()
	folder := filepath.Join(root, "platforms", "synthetic", "candidates")
	if err := os.MkdirAll(folder, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(folder, "candidate-platform-1.json")
	if err := os.WriteFile(path, []byte(candidatePlatformFixture), 0644); err != nil {
		t.Fatal(err)
	}
	handler := newHandler(t.TempDir(), root, "synthetic")
	first := request(handler, "/api/platforms/candidates?district=syn")
	if first.Code != 200 || !strings.Contains(first.Body.String(), "Alex Example") {
		t.Fatal(first.Code, first.Body.String())
	}
	if empty := request(handler, "/api/platforms/candidates?district=OTHER"); empty.Code != 200 || !strings.Contains(empty.Body.String(), `"platforms":[]`) {
		t.Fatal(empty.Code, empty.Body.String())
	}
	if empty := request(handler, "/api/platforms/parties"); empty.Code != 200 || !strings.Contains(empty.Body.String(), `"platforms":[]`) {
		t.Fatal(empty.Code, empty.Body.String())
	}
	if detail := request(handler, "/api/platforms/candidates/candidate-platform-1"); detail.Code != 200 || !strings.Contains(detail.Body.String(), "Alex Example") {
		t.Fatal(detail.Code)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/platforms/candidates?district=SYN", nil)
	req.Header.Set("If-None-Match", first.Header().Get("ETag"))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if response.Code != http.StatusNotModified {
		t.Fatal(response.Code)
	}
	if err := os.WriteFile(path, []byte(strings.ReplaceAll(candidatePlatformFixture, "Alex Example", "Updated Example")), 0644); err != nil {
		t.Fatal(err)
	}
	if response := request(handler, "/api/platforms/candidates"); !strings.Contains(response.Body.String(), "Updated Example") {
		t.Fatal(response.Body.String())
	}
	for _, url := range []string{"/api/platforms/unknown", "/api/platforms/candidates/missing", "/api/platforms/candidates?district=bad%2Fpath"} {
		if response := request(handler, url); response.Code != 404 {
			t.Fatal(url, response.Code)
		}
	}
}

func TestPlatformsRejectResearchBodiesAndWrongElection(t *testing.T) {
	root := t.TempDir()
	folder := filepath.Join(root, "platforms", "synthetic", "candidates")
	if err := os.MkdirAll(folder, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(folder, "record.json")
	handler := newHandler(t.TempDir(), root, "synthetic")
	for _, body := range []string{
		strings.Replace(candidatePlatformFixture, `"documents":[{`, `"documents":[{"pages":[{"text":"private research text"}],`, 1),
		strings.Replace(candidatePlatformFixture, `"election_id":"synthetic"`, `"election_id":"wrong"`, 1),
		`{`,
	} {
		if err := os.WriteFile(path, []byte(body), 0644); err != nil {
			t.Fatal(err)
		}
		response := request(handler, "/api/platforms/candidates")
		if response.Code != 503 || strings.Contains(response.Body.String(), "private research text") {
			t.Fatal(response.Code, response.Body.String())
		}
	}
}
