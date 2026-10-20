package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"bc-election/content-server/internal/publication"
)

func voterFixture(t *testing.T) (http.Handler, string) {
	t.Helper()
	root := t.TempDir()
	for _, name := range []string{"guide.json", "parties.json", "questionnaire.json", "polling.json"} {
		body, err := os.ReadFile(filepath.Join("../../content/bc-provincial-2026", name))
		if err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(root, "bc-provincial-2026", name)
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, body, 0644); err != nil {
			t.Fatal(err)
		}
	}
	return NewHandler(Config{ContentDir: root, ElectionID: "bc-provincial-2026"}), root
}
func TestVoterGuidePublications(t *testing.T) {
	handler, _ := voterFixture(t)
	for _, path := range []string{"/api/questionnaire", "/api/polling"} {
		response := request(handler, path)
		if response.Code != 200 {
			t.Fatalf("%s: %d %s", path, response.Code, response.Body.String())
		}
		if etag := response.Header().Get("ETag"); etag == "" {
			t.Fatalf("missing ETag for %s", path)
		} else {
			r := httptestWithETag(handler, path, etag)
			if r != 304 {
				t.Fatalf("expected revalidation, got %d", r)
			}
		}
	}
	response := request(handler, "/api/polling")
	var data publication.Polling
	if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Districts) != 93 || len(data.Surveys) != 2 {
		t.Fatal("incomplete initial coverage")
	}
}
func TestConflictingOrUncitedStancesFailClosed(t *testing.T) {
	for _, conflict := range []bool{true, false} {
		handler, root := voterFixture(t)
		path := filepath.Join(root, "bc-provincial-2026/questionnaire.json")
		body, _ := os.ReadFile(path)
		var data publication.Questionnaire
		json.Unmarshal(body, &data)
		if conflict {
			data.Questions[0].Stances = append(data.Questions[0].Stances, data.Questions[0].Stances[0])
		} else {
			data.Questions[0].Stances[0].Source.URL = "javascript:alert(1)"
		}
		writeFixture(t, path, data)
		if got := request(handler, "/api/questionnaire").Code; got != 503 {
			t.Fatalf("invalid stance exposed: %d", got)
		}
	}
}
func TestMislabelledPollingAndInventedLeadsFailClosed(t *testing.T) {
	for _, mutation := range []string{"scope", "kind", "leader", "share"} {
		handler, root := voterFixture(t)
		path := filepath.Join(root, "bc-provincial-2026/polling.json")
		body, _ := os.ReadFile(path)
		var data publication.Polling
		json.Unmarshal(body, &data)
		switch mutation {
		case "scope":
			data.Surveys[0].Scope = "district"
		case "kind":
			data.Districts[0].Kind = "poll"
		case "leader":
			data.Districts[0].Outlook = "toss_up"
		case "share":
			data.Surveys[0].Results[0].Share = 110
		}
		writeFixture(t, path, data)
		if got := request(handler, "/api/polling").Code; got != 503 {
			t.Fatalf("invalid polling %s exposed: %d", mutation, got)
		}
	}
}

func httptestWithETag(handler http.Handler, path, etag string) int {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	r.Header.Set("If-None-Match", etag)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w.Code
}
