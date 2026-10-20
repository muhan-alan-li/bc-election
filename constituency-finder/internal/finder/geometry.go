package finder

import (
	"encoding/json"
	"errors"
	"math"
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
	// Only segments within a centimetre can satisfy the edge tolerance. Avoid
	// trigonometry and projections for every distant edge of coastal polygons.
	dx := 0.010001 / (111320 * math.Abs(math.Cos(p[1]*math.Pi/180)))
	dy := 0.010001 / 111320
	for i := 1; i < len(ring); i++ {
		a, b := ring[i-1], ring[i]
		near := p[0] >= math.Min(a[0], b[0])-dx && p[0] <= math.Max(a[0], b[0])+dx && p[1] >= math.Min(a[1], b[1])-dy && p[1] <= math.Max(a[1], b[1])+dy
		if near && segmentDistance(p, a, b) < 0.01 {
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
