package finder

import (
	"encoding/json"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"testing"
)

func TestStaticFinderJavaScriptParity(t *testing.T) {
	dataset := "../../../client/tests/fixtures/static-finder.json"
	out := t.TempDir()
	catalog := filepath.Join(out, "catalog.json")
	if err := os.WriteFile(catalog, []byte(`{"districts":[{"official_code":"RCC"},{"official_code":"OTH"}]}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := ExportStatic(dataset, catalog, out); err != nil {
		t.Fatal(err)
	}
	checkJavaScriptParity(t, dataset, out, true)
}

func TestPostalLatitudeIndexMatchesOriginalGeometry(t *testing.T) {
	data, err := loadFinder("../../../client/tests/fixtures/static-finder.json")
	if err != nil {
		t.Fatal(err)
	}
	random := rand.New(rand.NewSource(29))
	for _, f := range data.Boundaries.Features {
		index := indexPostalFeature(f)
		check := func(p locationPoint) {
			if index.matches(p) != f.matches(p, 0) {
				t.Fatalf("index changed match for %s at %v", f.Properties.Code, p)
			}
		}
		for i := 0; i < 10000; i++ {
			check(locationPoint{f.BBox[0] + random.Float64()*(f.BBox[2]-f.BBox[0]), f.BBox[1] + random.Float64()*(f.BBox[3]-f.BBox[1])})
		}
		for _, polygon := range index.polygons {
			for _, ring := range polygon {
				for _, point := range ring.ring {
					check(point)
					check(locationPoint{point[0] + 1e-9, point[1] - 1e-9})
				}
				for i := range ring.bins {
					y := ring.bbox[1] + float64(i)*ring.step
					for _, x := range []float64{ring.bbox[0], (ring.bbox[0] + ring.bbox[2]) / 2, ring.bbox[2]} {
						check(locationPoint{x, y})
						check(locationPoint{x, y - 1e-9})
						check(locationPoint{x, y + 1e-9})
					}
				}
			}
		}
	}
}

// Optional check against the locally built production artifact. This neither
// imports data nor starts a server, and is not required on fresh CI checkouts.
func TestStaticFinderLocalDataParity(t *testing.T) {
	out := os.Getenv("BC_STATIC_PARITY_DIR")
	if out == "" {
		t.Skip("set BC_STATIC_PARITY_DIR to a production static build")
	}
	checkJavaScriptParity(t, "../../../ingestion/storage/published/finder.json", out, false)
}

func checkJavaScriptParity(t *testing.T, dataset, out string, synthetic bool) {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("Node is required for cross-language parity checks")
	}
	data, err := loadFinder(dataset)
	if err != nil {
		t.Fatal(err)
	}
	type testCase struct {
		Input Input    `json:"input"`
		Codes []string `json:"codes"`
	}
	cases := []testCase{}
	check := func(input Input) {
		points := []locationPoint{}
		if input.PostalCode != "" {
			record := data.PostalCodes[input.PostalCode]
			points = append(points, record.GeoNames...)
			points = append(points, record.StatCan...)
		} else {
			points = append(points, locationPoint{*input.Longitude, *input.Latitude})
		}
		codes := []string{}
		for _, f := range data.Boundaries.Features {
			for _, p := range points {
				if f.matches(p, input.Accuracy) {
					codes = append(codes, f.Properties.Code)
					break
				}
			}
		}
		sort.Strings(codes)
		cases = append(cases, testCase{input, codes})
	}
	coordinate := func(lon, lat, accuracy float64) { check(Input{Longitude: &lon, Latitude: &lat, Accuracy: accuracy}) }
	coordinate(-123.15, 49.10005, 0)  // Removed notch must trigger exact fallback.
	coordinate(-123.175, 49.125, 0)   // Hole.
	coordinate(-124.0005, 50.0005, 0) // Small separate island.
	coordinate(-123.1, 49.16, 0)      // Shared border.
	coordinate(-123.1001, 49.16, 50)  // Accuracy circle crosses shared border.
	random := rand.New(rand.NewSource(78))
	geometry := map[string]json.RawMessage{}
	for _, f := range data.Boundaries.Features {
		body, _ := json.Marshal(f.Geometry)
		geometry[f.Properties.Code] = body
		for i := 0; i < 8; i++ {
			coordinate(f.BBox[0]+random.Float64()*(f.BBox[2]-f.BBox[0]), f.BBox[1]+random.Float64()*(f.BBox[3]-f.BBox[1]), float64(i%3)*30)
		}
		for _, polygon := range f.Geometry.polygons {
			for _, ring := range polygon {
				// Exercise original vertices and both sides of individual edges.
				for _, i := range []int{0, len(ring) / 2} {
					p := ring[i]
					coordinate(p[0], p[1], 0)
					coordinate(p[0]+0.00000001, p[1]-0.00000001, 0)
					coordinate(p[0], p[1], 20)
				}
				if !synthetic {
					break
				}
			}
		}
	}
	postals := []string{}
	for code := range data.PostalCodes {
		postals = append(postals, code)
	}
	sort.Strings(postals)
	step := 1
	if !synthetic {
		step = len(postals)/100 + 1
	}
	for i := 0; i < len(postals); i += step {
		check(Input{PostalCode: postals[i]})
	}
	if synthetic {
		for i := 0; i < 300; i++ {
			coordinate(-123.21+random.Float64()*.22, 49.09+random.Float64()*.12, float64(i%4)*25)
		}
	}
	oracle, _ := json.Marshal(map[string]any{"cases": cases, "geometry": geometry, "synthetic": synthetic})
	file := filepath.Join(t.TempDir(), "oracle.json")
	if err := os.WriteFile(file, oracle, 0644); err != nil {
		t.Fatal(err)
	}
	output, err := exec.Command("node", "../../../client/tests/finder-parity.mjs", out, file).CombinedOutput()
	if err != nil {
		t.Fatalf("JavaScript differs from Go: %v\n%s", err, output)
	}
	t.Log(string(output))
}
