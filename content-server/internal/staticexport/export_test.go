package staticexport_test

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"bc-election/content-server/internal/httpapi"
	"bc-election/content-server/internal/publication"
	"bc-election/content-server/internal/staticexport"
)

func fixture(t *testing.T) (publication.Store, string) {
	t.Helper()
	root := t.TempDir()
	election := "bc-provincial-2026"
	generation := filepath.Join(root, "releases", election, "snapshot")
	write := func(name string, data any) {
		body, err := json.Marshal(data)
		if err != nil {
			t.Fatal(err)
		}
		file := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, body, 0644); err != nil {
			t.Fatal(err)
		}
	}
	pointer := map[string]any{"schema_version": 1, "election_id": election, "generation": "snapshot"}
	write("active/"+election+".json", pointer)
	write("releases/"+election+"/snapshot/manifest.json", pointer)
	if err := os.CopyFS(filepath.Join(generation, "content"), os.DirFS("../../content")); err != nil {
		t.Fatal(err)
	}
	district := publication.District{ID: "district-rcc", Code: "RCC", Name: "Richmond Centre", RosterStatus: "final_roster", CandidateCount: 0}
	write("releases/"+election+"/snapshot/data/"+election+"/catalog.json", publication.Catalog{SchemaVersion: 1, ElectionID: election, Districts: []publication.District{district}})
	write("releases/"+election+"/snapshot/data/"+election+"/ballots/RCC.json", publication.Ballot{SchemaVersion: 1, ElectionID: election, District: district, Parties: []json.RawMessage{}, Candidacies: []publication.Candidacy{}})
	return publication.Store{DataDir: root, ContentDir: "missing-legacy-content", ElectionID: election}, generation
}

func TestExportMatchesPublicAPIFromPinnedGeneration(t *testing.T) {
	store, _ := fixture(t)
	out := filepath.Join(t.TempDir(), "site")
	if err := staticexport.Export(store, out); err != nil {
		t.Fatal(err)
	}
	handler := httpapi.NewHandler(httpapi.Config{DataDir: store.DataDir, ContentDir: store.ContentDir, ElectionID: store.ElectionID})
	for _, name := range []string{"parties", "guide", "questionnaire", "polling", "districts", "districts/RCC/ballot"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", "/api/"+name, nil))
		body, err := os.ReadFile(filepath.Join(out, "data", name+".json"))
		if err != nil {
			t.Fatal(err)
		}
		var api, static any
		if err := json.Unmarshal(body, &static); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(response.Body.Bytes(), &api); err != nil {
			t.Fatal(err)
		}
		if response.Code != 200 || !reflect.DeepEqual(api, static) {
			t.Fatalf("API/export mismatch: %s", name)
		}
	}
	var guide publication.Guide
	body, _ := os.ReadFile(filepath.Join(out, "data/guide.json"))
	json.Unmarshal(body, &guide)
	for _, party := range append(guide.Parties, guide.OtherParties...) {
		if party.Portrait != "" {
			if body, err := os.ReadFile(filepath.Join(out, party.Portrait[1:])); err != nil || len(body) == 0 {
				t.Fatalf("missing portrait: %s", party.ID)
			}
		}
	}
	if _, err := os.Stat(filepath.Join(out, "finder.json")); !os.IsNotExist(err) {
		t.Fatal("finder should not be exported")
	}
}

func TestInvalidPublicationDoesNotWritePartialExport(t *testing.T) {
	store, generation := fixture(t)
	os.WriteFile(filepath.Join(generation, "content", store.ElectionID, "polling.json"), []byte("invalid"), 0644)
	out := filepath.Join(t.TempDir(), "site")
	if err := staticexport.Export(store, out); err == nil {
		t.Fatal("invalid publication accepted")
	}
	if _, err := os.Stat(out); !os.IsNotExist(err) {
		t.Fatal("partial export written")
	}
}
