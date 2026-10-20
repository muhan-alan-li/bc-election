package finder

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const suffixLetters = "ABCEGHJKLMNPRSTVWXYZ"
const simplificationMetres = 20.0

type staticDistrict struct {
	Code      string     `json:"code"`
	Name      string     `json:"name"`
	BBox      [4]float64 `json:"bbox"`
	Published bool       `json:"published"`
}

// ExportStatic retains the Go matcher's postal results exactly. Detailed
// geometry is lossless; only the display/fast-path geometry is simplified.
func ExportStatic(datasetPath, catalogPath, out string) error {
	source, err := os.ReadFile(datasetPath)
	if err != nil {
		return err
	}
	data, err := decodeFinder(source)
	if err != nil {
		return err
	}
	if len(data.Boundaries.Features) > 253 {
		return errors.New("too many districts for postal encoding")
	}
	var catalog struct {
		Districts []struct {
			Code string `json:"official_code"`
		} `json:"districts"`
	}
	body, err := os.ReadFile(catalogPath)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, &catalog); err != nil || len(catalog.Districts) == 0 {
		return errors.New("invalid public catalog")
	}
	published := map[string]bool{}
	for _, d := range catalog.Districts {
		published[d.Code] = true
	}
	// Include format version, source bytes and catalog in the URL identity.
	hash := sha256.New()
	hash.Write([]byte("static-finder-v1/20m/25m/"))
	hash.Write(source)
	hash.Write(body)
	version := hex.EncodeToString(hash.Sum(nil))[:20]
	root := filepath.Join(out, "finder", version)
	write := func(name string, body []byte) error {
		file := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
			return err
		}
		return os.WriteFile(file, body, 0644)
	}
	writeJSON := func(name string, value any) error {
		body, err := json.Marshal(value)
		if err != nil {
			return err
		}
		return write(name, body)
	}
	districts := []staticDistrict{}
	for _, f := range data.Boundaries.Features {
		districts = append(districts, staticDistrict{f.Properties.Code, f.Properties.Name, f.BBox, published[f.Properties.Code]})
		if err := write("detailed/"+f.Properties.Code+".bin", encodeGeometry(f.Geometry, false)); err != nil {
			return err
		}
		if err := write("boundaries/"+f.Properties.Code+".bin", encodeGeometry(simplifyGeometry(f.Geometry), true)); err != nil {
			return err
		}
	}
	tables := map[string][]byte{}
	ambiguities := map[string]map[string][]int{}
	codes := make([]string, 0, len(data.PostalCodes))
	for code := range data.PostalCodes {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	ambiguousCount, noMatchCount := 0, 0
	pointMatches := map[locationPoint][]int{}
	indexed := make([]postalFeatureIndex, len(data.Boundaries.Features))
	for i, f := range data.Boundaries.Features {
		indexed[i] = indexPostalFeature(f)
	}
	for _, code := range codes {
		prefix := code[:3]
		if tables[prefix] == nil {
			tables[prefix] = make([]byte, 2000)
		}
		record := data.PostalCodes[code]
		points := append(append([]locationPoint{}, record.GeoNames...), record.StatCan...)
		seen := map[int]bool{}
		for _, p := range points {
			indices, cached := pointMatches[p]
			if !cached {
				indices = []int{}
				for i, f := range indexed {
					if f.matches(p) {
						indices = append(indices, i)
					}
				}
				pointMatches[p] = indices
			}
			for _, i := range indices {
				seen[i] = true
			}
		}
		matches := []int{}
		for i := range seen {
			matches = append(matches, i)
		}
		sort.Ints(matches)
		index := int(code[3]-'0')*200 + strings.IndexByte(suffixLetters, code[4])*10 + int(code[5]-'0')
		switch len(matches) {
		case 0:
			tables[prefix][index] = 255
			noMatchCount++
		case 1:
			tables[prefix][index] = byte(matches[0] + 1)
		default:
			tables[prefix][index] = 254
			if ambiguities[prefix] == nil {
				ambiguities[prefix] = map[string][]int{}
			}
			ambiguities[prefix][code[3:]] = matches
			ambiguousCount++
		}
	}
	prefixes := make([]string, 0, len(tables))
	for prefix, table := range tables {
		prefixes = append(prefixes, prefix)
		if err := write("postal/"+prefix+".bin", table); err != nil {
			return err
		}
		if ambiguities[prefix] != nil {
			if err := writeJSON("ambiguities/"+prefix+".json", ambiguities[prefix]); err != nil {
				return err
			}
		}
	}
	sort.Strings(prefixes)
	// Preserve public provenance but exclude SourceStore's internal blob paths.
	var raw struct {
		Sources []map[string]any `json:"sources"`
	}
	if err := json.Unmarshal(source, &raw); err != nil {
		return err
	}
	for _, source := range raw.Sources {
		delete(source, "blob")
	}
	manifest := map[string]any{
		"schema_version": 1, "version": version, "base": "/finder/" + version + "/",
		"boundary_version": data.BoundaryVersion, "generated_at": data.GeneratedAt,
		"margin_m": 25, "districts": districts, "prefixes": prefixes, "sources": raw.Sources,
		"postal_count": len(codes), "ambiguous_count": ambiguousCount, "no_match_count": noMatchCount,
	}
	if err := writeJSON("index.json", manifest); err != nil {
		return err
	}
	body, err = json.Marshal(manifest)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(out, "finder/manifest.json"), body, 0644); err != nil {
		return err
	}
	fmt.Printf("Static finder: %d postal codes, %d prefixes, %d ambiguous, %d unmatched; %d boundaries\n", len(codes), len(prefixes), ambiguousCount, noMatchCount, len(districts))
	return nil
}

// BCG1: magic, Polygon(1)/MultiPolygon(2), decimal exponent (0 = exact
// Float64 fallback), followed by unsigned polygon/ring/point counts and signed
// zig-zag varint coordinate deltas. Detailed encoding rounds only when it can
// prove an exact Float64 round trip for every source coordinate.
func encodeGeometry(g boundaryGeometry, simplified bool) []byte {
	exponent := byte(8)
	if simplified {
		exponent = 6
	}
	scale := math.Pow10(int(exponent))
	if !simplified {
		for _, polygon := range g.polygons {
			for _, ring := range polygon {
				for _, p := range ring {
					for _, v := range p {
						if math.Round(v*scale)/scale != v {
							exponent = 0
						}
					}
				}
			}
		}
	}
	kind := byte(2)
	if g.Type == "Polygon" {
		kind = 1
	}
	out := []byte{'B', 'C', 'G', '1', kind, exponent}
	out = binary.AppendUvarint(out, uint64(len(g.polygons)))
	for _, polygon := range g.polygons {
		out = binary.AppendUvarint(out, uint64(len(polygon)))
		for _, ring := range polygon {
			out = binary.AppendUvarint(out, uint64(len(ring)))
			previous := [2]int64{}
			for _, p := range ring {
				for axis, v := range p {
					if exponent == 0 {
						out = binary.LittleEndian.AppendUint64(out, math.Float64bits(v))
						continue
					}
					n := int64(math.Round(v * scale))
					out = binary.AppendVarint(out, n-previous[axis])
					previous[axis] = n
				}
			}
		}
	}
	return out
}

func simplifyGeometry(g boundaryGeometry) boundaryGeometry {
	result := boundaryGeometry{Type: g.Type}
	for _, polygon := range g.polygons {
		var rings [][]locationPoint
		for _, ring := range polygon {
			rings = append(rings, simplifyRing(ring))
		}
		result.polygons = append(result.polygons, rings)
	}
	return result
}

func simplifyRing(ring []locationPoint) []locationPoint {
	keep := make([]bool, len(ring))
	keep[0], keep[len(ring)-1] = true, true
	stack := [][2]int{{0, len(ring) - 1}}
	tolerance := simplificationMetres / 111320
	for len(stack) > 0 {
		pair := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		a, b := ring[pair[0]], ring[pair[1]]
		dx, dy := b[0]-a[0], b[1]-a[1]
		maximum, index := tolerance*tolerance, -1
		for i := pair[0] + 1; i < pair[1]; i++ {
			p := ring[i]
			t := 0.0
			if d := dx*dx + dy*dy; d > 0 {
				t = math.Max(0, math.Min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d))
			}
			x, y := p[0]-a[0]-t*dx, p[1]-a[1]-t*dy
			if d := x*x + y*y; d > maximum {
				maximum, index = d, i
			}
		}
		if index >= 0 {
			keep[index] = true
			stack = append(stack, [2]int{pair[0], index}, [2]int{index, pair[1]})
		}
	}
	result := []locationPoint{}
	for i, p := range ring {
		if keep[i] {
			result = append(result, p)
		}
	}
	// Never discard a small island or hole.
	if len(result) < 4 {
		return ring
	}
	return result
}
