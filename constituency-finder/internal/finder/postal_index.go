package finder

import "math"

// Build-time latitude bins select exactly the edges the ray can cross (plus
// the centimetre edge tolerance). This avoids scanning coastal polygons for
// each of 122,000 postal codes, without simplifying their geometry.
type postalRingIndex struct {
	ring []locationPoint
	bbox [4]float64
	step float64
	bins [][]int
}

type postalFeatureIndex struct {
	bbox     [4]float64
	polygons [][]postalRingIndex
}

func indexPostalFeature(f boundaryFeature) postalFeatureIndex {
	result := postalFeatureIndex{bbox: f.BBox}
	for _, polygon := range f.Geometry.polygons {
		rings := []postalRingIndex{}
		for _, ring := range polygon {
			index := postalRingIndex{ring: ring, bbox: [4]float64{180, 90, -180, -90}}
			for _, p := range ring {
				index.bbox[0] = math.Min(index.bbox[0], p[0])
				index.bbox[1] = math.Min(index.bbox[1], p[1])
				index.bbox[2] = math.Max(index.bbox[2], p[0])
				index.bbox[3] = math.Max(index.bbox[3], p[1])
			}
			count := max(1, min(2048, int(math.Ceil((index.bbox[3]-index.bbox[1])/.005))))
			index.step = math.Max(1e-12, (index.bbox[3]-index.bbox[1])/float64(count))
			index.bins = make([][]int, count)
			for i := 1; i < len(ring); i++ {
				low, high := index.bin(math.Min(ring[i-1][1], ring[i][1])), index.bin(math.Max(ring[i-1][1], ring[i][1]))
				for b := low; b <= high; b++ {
					index.bins[b] = append(index.bins[b], i)
				}
			}
			rings = append(rings, index)
		}
		result.polygons = append(result.polygons, rings)
	}
	return result
}

func (r postalRingIndex) bin(y float64) int {
	return max(0, min(len(r.bins)-1, int(math.Floor((y-r.bbox[1])/r.step))))
}

func (r postalRingIndex) contains(p locationPoint) (bool, bool) {
	dx := .010001 / (111320 * math.Abs(math.Cos(p[1]*math.Pi/180)))
	dy := .010001 / 111320
	if p[0] < r.bbox[0]-dx || p[0] > r.bbox[2]+dx || p[1] < r.bbox[1]-dy || p[1] > r.bbox[3]+dy {
		return false, false
	}
	inside := false
	primary := r.bin(p[1])
	for b := r.bin(p[1] - dy); b <= r.bin(p[1]+dy); b++ {
		for _, i := range r.bins[b] {
			a, c := r.ring[i-1], r.ring[i]
			if p[0] >= math.Min(a[0], c[0])-dx && p[0] <= math.Max(a[0], c[0])+dx && segmentDistance(p, a, c) < .01 {
				return true, true
			}
			if b == primary && (a[1] > p[1]) != (c[1] > p[1]) && p[0] < (c[0]-a[0])*(p[1]-a[1])/(c[1]-a[1])+a[0] {
				inside = !inside
			}
		}
	}
	return inside, false
}

func (f postalFeatureIndex) matches(p locationPoint) bool {
	if p[0] < f.bbox[0] || p[0] > f.bbox[2] || p[1] < f.bbox[1] || p[1] > f.bbox[3] {
		return false
	}
	for _, polygon := range f.polygons {
		inside, edge := polygon[0].contains(p)
		if edge {
			return true
		}
		if inside {
			for _, hole := range polygon[1:] {
				inHole, edge := hole.contains(p)
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
	}
	return false
}
