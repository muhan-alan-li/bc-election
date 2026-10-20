package publication

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
)

// Store reads the current published files on each request, so publication updates
// take effect without a server restart. It never writes to the publication.
type Store struct {
	DataDir    string
	ContentDir string
	ElectionID string
}

var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func ValidID(id string) bool     { return safeID.MatchString(id) }
func ValidKind(kind string) bool { return kind == "parties" || kind == "candidates" }

func readJSON(path string, value any) error {
	body, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, value)
}

func (s Store) electionFolder() string { return filepath.Join(s.DataDir, s.ElectionID) }
