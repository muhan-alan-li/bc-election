package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const fixture = `{
  "schema_version": 2, "generated_at": "2026-10-07T00:00:00Z",
  "election": {"id": "synthetic", "title": "Synthetic election"},
  "district": {"id": "district-1", "official_code": "SYN", "name": "Synthetic Constituency", "roster_status": "provisional"},
  "people": [{"id": "person-1", "name": "Alex Example"}], "parties": [],
  "candidacies": [{"id": "candidate-1", "person_id": "person-1", "election_id": "synthetic", "district_id": "district-1", "ballot_name": "Alex Example", "party_id": null, "affiliation": "independent", "status": "listed"}],
  "votes": [], "disclosures": [], "interests": [], "coverage": [],
  "identity_leads": [{"private": "unreviewed"}], "tasks": ["internal"], "sources": [{"blob": "local-cache-path"}]
}`

func setupAPI(t *testing.T) (http.Handler, string) {
	t.Helper()
	root := t.TempDir()
	folder := filepath.Join(root, "synthetic")
	if err := os.MkdirAll(folder, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(folder, "SYN.json")
	if err := os.WriteFile(path, []byte(fixture), 0644); err != nil {
		t.Fatal(err)
	}
	return newHandler(t.TempDir(), root, "synthetic"), path
}

func request(handler http.Handler, url string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, url, nil))
	return recorder
}

func TestDistrictSearchAndPublicDataset(t *testing.T) {
	handler, _ := setupAPI(t)
	for _, query := range []string{"synthetic", "syn", "CONSTITUENCY"} {
		response := request(handler, "/api/districts?q="+query)
		if response.Code != 200 || !strings.Contains(response.Body.String(), `"candidate_count":1`) {
			t.Fatal(response.Code, response.Body.String())
		}
	}
	response := request(handler, "/api/districts?q=unpublished")
	if !strings.Contains(response.Body.String(), `"districts":[]`) {
		t.Fatal(response.Body.String())
	}
	response = request(handler, "/api/districts/syn")
	if response.Code != 200 || !strings.Contains(response.Body.String(), "Alex Example") {
		t.Fatal(response.Code, response.Body.String())
	}
	for _, internal := range []string{"identity_leads", "local-cache-path", `"tasks"`} {
		if strings.Contains(response.Body.String(), internal) {
			t.Fatalf("Public response contains %s", internal)
		}
	}
}

func TestRevalidationAndPublicationReload(t *testing.T) {
	handler, path := setupAPI(t)
	first := request(handler, "/api/districts/SYN")
	req := httptest.NewRequest("GET", "/api/districts/SYN", nil)
	req.Header.Set("If-None-Match", "W/"+first.Header().Get("ETag"))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if response.Code != http.StatusNotModified || response.Body.Len() != 0 {
		t.Fatal(response.Code)
	}
	updated := strings.ReplaceAll(fixture, "Alex Example", "Updated Example")
	if err := os.WriteFile(path, []byte(updated), 0644); err != nil {
		t.Fatal(err)
	}
	response = request(handler, "/api/districts/SYN")
	if !strings.Contains(response.Body.String(), "Updated Example") || response.Header().Get("ETag") == first.Header().Get("ETag") {
		t.Fatal("Publication did not reload")
	}
}

func TestUnavailableAndInvalidData(t *testing.T) {
	handler, path := setupAPI(t)
	for _, url := range []string{"/api/districts/MISSING", "/api/unknown", "/api/districts/bad%20code"} {
		response := request(handler, url)
		if response.Code != 404 || !strings.Contains(response.Header().Get("Content-Type"), "application/json") {
			t.Fatal(url, response.Code)
		}
	}
	for _, invalid := range []string{"{", strings.Replace(fixture, `"schema_version": 2`, `"schema_version": 1`, 1), strings.Replace(fixture, `"person_id": "person-1"`, `"person_id": "unknown"`, 1)} {
		if err := os.WriteFile(path, []byte(invalid), 0644); err != nil {
			t.Fatal(err)
		}
		response := request(handler, "/api/districts/SYN")
		if response.Code != 503 {
			t.Fatal(response.Code, response.Body.String())
		}
	}
}

func TestEmptyCatalogAndStaticClient(t *testing.T) {
	client := t.TempDir()
	if err := os.WriteFile(filepath.Join(client, "index.html"), []byte("<html>client</html>"), 0644); err != nil {
		t.Fatal(err)
	}
	handler := newHandler(client, t.TempDir(), "synthetic")
	if response := request(handler, "/"); response.Code != 200 || !strings.Contains(response.Body.String(), "client") {
		t.Fatal(response.Code)
	}
	if response := request(handler, "/api/districts"); response.Code != 200 || !strings.Contains(response.Body.String(), `"districts":[]`) {
		t.Fatal(response.Code)
	}
}

func TestRichmondCentrePublication(t *testing.T) {
	path := "../ingestion/storage/published/bc-provincial-2026/RCC.json"
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skip("Local generated publication is not present")
	}
	data, err := loadDataset(path, "bc-provincial-2026", "RCC")
	if err != nil {
		t.Fatal(err)
	}
	if len(data.Candidacies) != 4 {
		t.Fatalf("Expected pilot roster, got %d", len(data.Candidacies))
	}
	response := request(newHandler(t.TempDir(), "../ingestion/storage/published", "bc-provincial-2026"), "/api/districts/RCC")
	var body map[string]any
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &body) != nil {
		t.Fatal(response.Code)
	}
}
