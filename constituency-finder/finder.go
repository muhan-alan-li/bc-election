package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type locationPoint [2]float64 // longitude, latitude

// Decode GeoJSON once. Matching and response encoding share the same coordinates.
type boundaryGeometry struct {
	Type     string
	polygons [][][]locationPoint
}

func (g *boundaryGeometry) UnmarshalJSON(body []byte) error {
	var raw struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return err
	}
	g.Type = raw.Type
	switch raw.Type {
	case "Polygon":
		var polygon [][]locationPoint
		if err := json.Unmarshal(raw.Coordinates, &polygon); err != nil {
			return err
		}
		g.polygons = [][][]locationPoint{polygon}
	case "MultiPolygon":
		if err := json.Unmarshal(raw.Coordinates, &g.polygons); err != nil {
			return err
		}
	default:
		return errors.New("unsupported boundary geometry")
	}
	// Discard decoder over-allocation without changing coordinate precision.
	for _, polygon := range g.polygons {
		for i, ring := range polygon {
			if cap(ring) > len(ring) {
				polygon[i] = append([]locationPoint(nil), ring...)
			}
		}
	}
	return nil
}
func (g boundaryGeometry) MarshalJSON() ([]byte, error) {
	var coords any = g.polygons
	if g.Type == "Polygon" {
		if len(g.polygons) != 1 {
			return nil, errors.New("invalid polygon")
		}
		coords = g.polygons[0]
	}
	return json.Marshal(struct {
		Type        string `json:"type"`
		Coordinates any    `json:"coordinates"`
	}{g.Type, coords})
}

type boundaryFeature struct {
	Type       string `json:"type"`
	Properties struct {
		Code string `json:"official_code"`
		Name string `json:"name"`
	} `json:"properties"`
	BBox     [4]float64       `json:"bbox"`
	Geometry boundaryGeometry `json:"geometry"`
}

// A fixed record avoids a separate map and duplicated source strings for each postal code.
type postalLocations struct {
	GeoNames []locationPoint `json:"geonames,omitempty"`
	StatCan  []locationPoint `json:"statcan,omitempty"`
}

func (p *postalLocations) UnmarshalJSON(body []byte) error {
	type plain postalLocations
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	return decoder.Decode((*plain)(p))
}

type finderData struct {
	SchemaVersion   int                        `json:"schema_version"`
	BoundaryVersion string                     `json:"boundary_version"`
	GeneratedAt     string                     `json:"generated_at"`
	PostalCodes     map[string]postalLocations `json:"postal_codes"`
	Boundaries      struct {
		Features []boundaryFeature `json:"features"`
	} `json:"boundaries"`
}

var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

var postalPattern = regexp.MustCompile(`^V[0-9][ABCEGHJKLMNPRSTVWXYZ][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9]$`)

func loadFinder(path string) (*finderData, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var data finderData
	if err = json.Unmarshal(body, &data); err != nil {
		return nil, err
	}
	if data.SchemaVersion != 1 || data.BoundaryVersion != "bc-2023-redistribution-set-11" || len(data.Boundaries.Features) == 0 || len(data.PostalCodes) == 0 {
		return nil, errors.New("invalid finder dataset")
	}
	seen := map[string]bool{}
	for i := range data.Boundaries.Features {
		f := &data.Boundaries.Features[i]
		if !safeID.MatchString(f.Properties.Code) || f.Properties.Name == "" || seen[f.Properties.Code] {
			return nil, errors.New("invalid boundary identity")
		}
		seen[f.Properties.Code] = true
		if len(f.Geometry.polygons) == 0 {
			return nil, errors.New("invalid boundary geometry")
		}
		for _, polygon := range f.Geometry.polygons {
			if len(polygon) == 0 {
				return nil, errors.New("empty polygon")
			}
			for _, ring := range polygon {
				if len(ring) < 4 || ring[0] != ring[len(ring)-1] {
					return nil, errors.New("invalid ring")
				}
				for _, p := range ring {
					if !validLocation(p) {
						return nil, errors.New("invalid coordinate")
					}
				}
			}
		}
	}
	for code, record := range data.PostalCodes {
		if !postalPattern.MatchString(code) || len(record.GeoNames)+len(record.StatCan) == 0 {
			return nil, errors.New("invalid postal record")
		}
		for _, points := range [][]locationPoint{record.GeoNames, record.StatCan} {
			for _, p := range points {
				if !validLocation(p) {
					return nil, errors.New("invalid postal coordinate")
				}
			}
		}
	}
	return &data, nil
}
func validLocation(p locationPoint) bool {
	return !math.IsNaN(p[0]) && !math.IsNaN(p[1]) && !math.IsInf(p[0], 0) && !math.IsInf(p[1], 0) && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90
}
func segmentDistance(p, a, b locationPoint) float64 {
	// Local metre projection; sufficient for a browser accuracy circle, not geodesic surveying.
	scaleX := 111320 * math.Cos(p[1]*math.Pi/180)
	scaleY := 111320.0
	ax, ay := (a[0]-p[0])*scaleX, (a[1]-p[1])*scaleY
	bx, by := (b[0]-p[0])*scaleX, (b[1]-p[1])*scaleY
	dx, dy := bx-ax, by-ay
	t := 0.0
	if length := dx*dx + dy*dy; length > 0 {
		t = math.Max(0, math.Min(1, -(ax*dx+ay*dy)/length))
	}
	return math.Hypot(ax+t*dx, ay+t*dy)
}
func ringContains(p locationPoint, ring []locationPoint) (bool, bool) {
	inside := false
	for i := 1; i < len(ring); i++ {
		a, b := ring[i-1], ring[i]
		if segmentDistance(p, a, b) < 0.01 {
			return true, true
		}
		if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0] {
			inside = !inside
		}
	}
	return inside, false
}
func (f boundaryFeature) matches(p locationPoint, accuracy float64) bool {
	dy := accuracy / 111320
	dx := accuracy / (111320 * math.Max(.01, math.Cos(p[1]*math.Pi/180)))
	if p[0] < f.BBox[0]-dx || p[0] > f.BBox[2]+dx || p[1] < f.BBox[1]-dy || p[1] > f.BBox[3]+dy {
		return false
	}
	for _, polygon := range f.Geometry.polygons {
		inside, onEdge := ringContains(p, polygon[0])
		if onEdge {
			return true
		}
		if inside {
			for _, hole := range polygon[1:] {
				inHole, edge := ringContains(p, hole)
				if edge {
					return true
				}
				if inHole {
					inside = false
					break
				}
			}
			if inside {
				return true
			}
		}
		if accuracy > 0 {
			for _, ring := range polygon {
				for i := 1; i < len(ring); i++ {
					if segmentDistance(p, ring[i-1], ring[i]) <= accuracy {
						return true
					}
				}
			}
		}
	}
	return false
}

func registerFinder(mux *http.ServeMux, dataDir, electionID string) {
	loader := &lazyFinder{load: func() (*finderData, error) { return loadFinder(filepath.Join(dataDir, "finder.json")) }}
	cache := newPostalCache(256, 10*time.Minute)
	mux.HandleFunc("POST /api/constituency-finder", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		fail := func(status int, message string) {
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
		}
		var input struct {
			PostalCode string   `json:"postal_code"`
			Latitude   *float64 `json:"latitude"`
			Longitude  *float64 `json:"longitude"`
			Accuracy   float64  `json:"accuracy_m"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&input); err != nil {
			fail(400, "Enter a postal code or a valid location.")
			return
		}
		var extra any
		if decoder.Decode(&extra) != io.EOF {
			fail(400, "Invalid request body.")
			return
		}
		postal := strings.ToUpper(strings.Join(strings.Fields(input.PostalCode), ""))
		if (postal != "" && (input.Latitude != nil || input.Longitude != nil || input.Accuracy != 0)) || (postal == "" && (input.Latitude == nil || input.Longitude == nil)) {
			fail(400, "Provide either a postal code or coordinates.")
			return
		}
		if postal != "" && !postalPattern.MatchString(postal) {
			fail(400, "Enter a full British Columbia postal code, such as V6Y 1N9.")
			return
		}
		if input.Accuracy < 0 || input.Accuracy > 100000 {
			fail(400, "Location accuracy must be between 0 and 100,000 metres.")
			return
		}
		if postal == "" && !validLocation(locationPoint{*input.Longitude, *input.Latitude}) {
			fail(400, "Location coordinates are invalid.")
			return
		}
		data, loadErr := loader.get()
		if loadErr != nil {
			fail(503, "The constituency finder data is unavailable. Use Elections BC’s district finder.")
			return
		}
		var points []locationPoint
		sources := []string{}
		method := "geolocation"
		if postal != "" {
			method = "postal_code"
			record, ok := data.PostalCodes[postal]
			if !ok {
				fail(404, "This postal code is missing from our local data. Try your location or place a pin on the map.")
				return
			}
			if len(record.GeoNames) > 0 {
				sources = append(sources, "geonames")
				points = append(points, record.GeoNames...)
			}
			if len(record.StatCan) > 0 {
				sources = append(sources, "statcan")
				points = append(points, record.StatCan...)
			}
		} else {
			points = []locationPoint{{*input.Longitude, *input.Latitude}}
		}
		type match struct {
			Code      string          `json:"official_code"`
			Name      string          `json:"name"`
			Published bool            `json:"published"`
			Feature   boundaryFeature `json:"feature"`
		}
		var indices []int
		cached := false
		if postal != "" {
			indices, cached = cache.get(postal)
		}
		if !cached {
			for i, feature := range data.Boundaries.Features {
				for _, point := range points {
					if r.Context().Err() != nil {
						return
					}
					if feature.matches(point, input.Accuracy) {
						indices = append(indices, i)
						break
					}
				}
			}
			if postal != "" {
				cache.put(postal, indices)
			}
		}
		matches := []match{}
		for _, index := range indices {
			feature := data.Boundaries.Features[index]
			// Recheck availability every time: candidate research may be published after caching.
			info, err := os.Stat(filepath.Join(dataDir, electionID, feature.Properties.Code+".json"))
			matches = append(matches, match{feature.Properties.Code, feature.Properties.Name, err == nil && info.Mode().IsRegular(), feature})
		}
		sort.Slice(matches, func(i, j int) bool { return matches[i].Name < matches[j].Name })
		status := "approximate"
		if len(matches) == 0 {
			status = "no_match"
		} else if len(matches) > 1 {
			status = "ambiguous"
		}
		// Map centres on one recorded point; do not average points into an invented location.
		_ = json.NewEncoder(w).Encode(map[string]any{"status": status, "method": method, "location": map[string]any{"longitude": points[0][0], "latitude": points[0][1], "accuracy_m": input.Accuracy}, "sources": sources, "sample_count": len(points), "districts": matches, "boundary_version": data.BoundaryVersion, "generated_at": data.GeneratedAt, "approximate": true})
	})
}
