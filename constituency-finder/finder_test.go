package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func finderRequest(handler http.Handler, body string) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("POST", "/api/constituency-finder", strings.NewReader(body)))
	return response
}
func TestFinderGeometry(t *testing.T) {
	f := boundaryFeature{BBox: [4]float64{-124, 49, -122, 51}, Geometry: boundaryGeometry{polygons: [][][]locationPoint{{{{-124, 49}, {-122, 49}, {-122, 51}, {-124, 51}, {-124, 49}}, {{-123.5, 49.5}, {-123, 49.5}, {-123, 50}, {-123.5, 50}, {-123.5, 49.5}}}}}}
	for _, test := range []struct {
		p        locationPoint
		accuracy float64
		want     bool
	}{{locationPoint{-123.8, 50}, 0, true}, {locationPoint{-123.2, 49.7}, 0, false}, {locationPoint{-124, 50}, 0, true}, {locationPoint{-124.001, 50}, 100, true}, {locationPoint{-124.01, 50}, 100, false}, {locationPoint{-123.2, 49.7}, 30000, true}} {
		if got := f.matches(test.p, test.accuracy); got != test.want {
			t.Fatalf("%v accuracy %v got %v", test.p, test.accuracy, got)
		}
	}
}
func TestFinderAPI(t *testing.T) {
	root := t.TempDir()
	body := `{"schema_version":1,"boundary_version":"bc-2023-redistribution-set-11","postal_codes":{"V6Y1N9":{"geonames":[[-123.5,49.5]],"statcan":[[-122.5,49.5]]}},"boundaries":{"features":[
 {"type":"Feature","properties":{"official_code":"AAA","name":"A"},"bbox":[-124,49,-123,50],"geometry":{"type":"Polygon","coordinates":[[[-124,49],[-123,49],[-123,50],[-124,50],[-124,49]]]}},
 {"type":"Feature","properties":{"official_code":"BBB","name":"B"},"bbox":[-123,49,-122,50],"geometry":{"type":"MultiPolygon","coordinates":[[[[-123,49],[-122,49],[-122,50],[-123,50],[-123,49]]]]}}]}}`
	if err := os.WriteFile(filepath.Join(root, "finder.json"), []byte(body), 0644); err != nil {
		t.Fatal(err)
	}
	handler := newFinderHandler(root, "synthetic")
	response := finderRequest(handler, `{"postal_code":"v6y 1n9"}`)
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"status":"ambiguous"`) || !strings.Contains(response.Body.String(), `"published":false`) {
		t.Fatal(response.Code, response.Body.String())
	}
	// The cached match must not freeze candidate publication availability.
	if err := os.MkdirAll(filepath.Join(root, "synthetic"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "synthetic", "AAA.json"), []byte(`{}`), 0644); err != nil {
		t.Fatal(err)
	}
	if cached := finderRequest(handler, `{"postal_code":"V6Y1N9"}`); !strings.Contains(cached.Body.String(), `"published":true`) {
		t.Fatal("Publication availability became stale", cached.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("location response cached")
	}
	for _, test := range []struct {
		name, input, status string
		code                int
	}{
		{"incomplete postal code", `{"postal_code":"V6Y"}`, "", 400},
		{"invalid latitude", `{"latitude":91,"longitude":-123}`, "", 400},
		{"missing longitude", `{"latitude":49}`, "", 400},
		{"mixed inputs", `{"postal_code":"V6Y1N9","latitude":49,"longitude":-123}`, "", 400},
		{"negative accuracy", `{"latitude":49,"longitude":-123,"accuracy_m":-1}`, "", 400},
		{"multiple JSON objects", `{} {}`, "", 400},
		{"unknown field", `{"extra":1}`, "", 400},
		{"unknown postal code", `{"postal_code":"V6Y9Z9"}`, "", 404},
		{"outside BC", `{"latitude":40,"longitude":-123}`, "no_match", 200},
		{"shared boundary", `{"latitude":49.5,"longitude":-123}`, "ambiguous", 200},
		{"accuracy spans boundary", `{"latitude":49.5,"longitude":-123.001,"accuracy_m":100}`, "ambiguous", 200},
	} {
		t.Run(test.name, func(t *testing.T) {
			got := finderRequest(handler, test.input)
			if got.Code != test.code {
				t.Fatalf("got %d, want %d: %s", got.Code, test.code, got.Body.String())
			}
			var result struct {
				Status string `json:"status"`
			}
			if err := json.Unmarshal(got.Body.Bytes(), &result); err != nil {
				t.Fatal("Response is not JSON", err)
			}
			if test.status != "" && result.Status != test.status {
				t.Fatalf("got status %q, want %q", result.Status, test.status)
			}
			if got.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("Location response may be cached")
			}
		})
	}
	missing := newFinderHandler(t.TempDir(), "synthetic")
	if got := finderRequest(missing, `{"latitude":49,"longitude":-123}`); got.Code != 503 {
		t.Fatal(got.Code)
	}
}
func TestLocalFinderPublication(t *testing.T) {
	path := "../ingestion/storage/published/finder.json"
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skip("Imported finder data absent")
	}
	handler := newFinderHandler("../ingestion/storage/published", "bc-provincial-2026")
	for _, input := range []string{`{"postal_code":"V6Y1N9"}`, `{"latitude":49.17,"longitude":-123.14}`} {
		got := finderRequest(handler, input)
		var result struct {
			Status    string `json:"status"`
			Districts []struct {
				Code string `json:"official_code"`
			} `json:"districts"`
		}
		if got.Code != 200 || json.Unmarshal(got.Body.Bytes(), &result) != nil || len(result.Districts) == 0 {
			t.Fatal(got.Code, got.Body.String())
		}
		t.Log(input, result.Status, result.Districts)
	}
}

func TestBoundaryGeometryRoundTrip(t *testing.T) {
	for _, body := range []string{
		`{"type":"Polygon","coordinates":[[[-123.123456789012,49.123456789012],[-122,49],[-122,50],[-123.123456789012,49.123456789012]],[[-122.8,49.2],[-122.5,49.2],[-122.5,49.5],[-122.8,49.2]]]}`,
		`{"type":"MultiPolygon","coordinates":[[[[-124,49],[-123,49],[-123,50],[-124,49]]],[[[-122,49],[-121,49],[-121,50],[-122,49]]]]}`,
	} {
		var geometry boundaryGeometry
		if err := json.Unmarshal([]byte(body), &geometry); err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(geometry)
		if err != nil {
			t.Fatal(err)
		}
		var before, after any
		if err := json.Unmarshal([]byte(body), &before); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(encoded, &after); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(before, after) {
			t.Fatalf("Geometry changed: %s", encoded)
		}
	}
	var postal postalLocations
	if err := json.Unmarshal([]byte(`{"unknown":[[-123,49]]}`), &postal); err == nil {
		t.Fatal("Unknown source accepted")
	}
}

func TestHealthWithoutDataset(t *testing.T) {
	handler := newFinderHandler(t.TempDir(), "synthetic")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("GET", "/health", nil))
	if response.Code != 200 || response.Body.String() != `{"status":"ok"}` {
		t.Fatal(response.Code, response.Body.String())
	}
}
