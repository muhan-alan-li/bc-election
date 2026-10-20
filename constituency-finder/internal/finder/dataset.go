package finder

import (
	"encoding/json"
	"errors"
	"os"
	"regexp"
)

var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

var postalPattern = regexp.MustCompile(`^V[0-9][ABCEGHJKLMNPRSTVWXYZ][0-9][ABCEGHJKLMNPRSTVWXYZ][0-9]$`)

func loadFinder(path string) (*finderData, error) {
	body, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return decodeFinder(body)
}

func decodeFinder(body []byte) (*finderData, error) {
	var data finderData
	if err := json.Unmarshal(body, &data); err != nil {
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
