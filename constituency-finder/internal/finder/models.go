package finder

import (
	"bytes"
	"encoding/json"
)

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
