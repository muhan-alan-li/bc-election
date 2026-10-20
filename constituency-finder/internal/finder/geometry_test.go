package finder

import (
	"encoding/json"
	"reflect"
	"testing"
)

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
