package finder

type Match struct {
	Code      string          `json:"official_code"`
	Name      string          `json:"name"`
	Published bool            `json:"published"`
	Feature   boundaryFeature `json:"feature"`
}

type Result struct {
	Status          string   `json:"status"`
	Method          string   `json:"method"`
	Location        Location `json:"location"`
	Sources         []string `json:"sources"`
	SampleCount     int      `json:"sample_count"`
	Districts       []Match  `json:"districts"`
	BoundaryVersion string   `json:"boundary_version"`
	GeneratedAt     string   `json:"generated_at"`
	Approximate     bool     `json:"approximate"`
}

type Location struct {
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	Accuracy  float64 `json:"accuracy_m"`
}
