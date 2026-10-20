package finder

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"time"
)

var ErrUnavailable = errors.New("The constituency finder data is unavailable. Use Elections BC’s district finder.")
var ErrPostalMissing = errors.New("This postal code is missing from our local data. Try your location or place a pin on the map.")

type Service struct {
	dataDir    string
	electionID string
	loader     *lazyFinder
	cache      *postalCache
}

func NewService(dataDir, electionID string) *Service {
	return &Service{
		dataDir: dataDir, electionID: electionID,
		loader: &lazyFinder{load: func() (*finderData, error) { return loadFinder(filepath.Join(dataDir, "finder.json")) }},
		cache:  newPostalCache(256, 10*time.Minute),
	}
}

func (s *Service) Lookup(ctx context.Context, input Input) (Result, error) {
	if err := input.Normalize(); err != nil {
		return Result{}, err
	}
	postal := input.PostalCode
	data, loadErr := s.loader.get()
	if loadErr != nil {
		return Result{}, ErrUnavailable
	}
	var points []locationPoint
	sources := []string{}
	method := "geolocation"
	if postal != "" {
		method = "postal_code"
		record, ok := data.PostalCodes[postal]
		if !ok {
			return Result{}, ErrPostalMissing
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
	var indices []int
	cached := false
	if postal != "" {
		indices, cached = s.cache.get(postal)
	}
	if !cached {
		for i, feature := range data.Boundaries.Features {
			for _, point := range points {
				if ctx.Err() != nil {
					return Result{}, ctx.Err()
				}
				if feature.matches(point, input.Accuracy) {
					indices = append(indices, i)
					break
				}
			}
		}
		if postal != "" {
			s.cache.put(postal, indices)
		}
	}
	matches := []Match{}
	for _, index := range indices {
		feature := data.Boundaries.Features[index]
		// Recheck availability every time: candidate research may be published after caching.
		info, err := os.Stat(filepath.Join(s.dataDir, s.electionID, feature.Properties.Code+".json"))
		matches = append(matches, Match{feature.Properties.Code, feature.Properties.Name, err == nil && info.Mode().IsRegular(), feature})
	}
	sort.Slice(matches, func(i, j int) bool { return matches[i].Name < matches[j].Name })
	status := "approximate"
	if len(matches) == 0 {
		status = "no_match"
	} else if len(matches) > 1 {
		status = "ambiguous"
	}

	// Map centres on one recorded point; do not average points into an invented location.
	return Result{Status: status, Method: method, Location: Location{points[0][0], points[0][1], input.Accuracy}, Sources: sources, SampleCount: len(points), Districts: matches, BoundaryVersion: data.BoundaryVersion, GeneratedAt: data.GeneratedAt, Approximate: true}, nil
}
