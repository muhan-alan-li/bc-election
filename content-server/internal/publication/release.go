package publication

import (
	"errors"
	"os"
	"path/filepath"
)

type releasePointer struct {
	SchemaVersion int    `json:"schema_version"`
	ElectionID    string `json:"election_id"`
	Generation    string `json:"generation"`
}

// Pin resolves the active generation once. Every loader used by a handler then
// reads the same immutable directory, even if publication changes mid-request.
func (s Store) Pin() (Store, string, error) {
	if !ValidID(s.ElectionID) {
		return s, "", errors.New("invalid election ID")
	}
	var pointer releasePointer
	err := readJSON(filepath.Join(s.DataDir, "active", s.ElectionID+".json"), &pointer)
	if errors.Is(err, os.ErrNotExist) {
		return s, "legacy", nil
	}
	if err != nil {
		return s, "", err
	}
	if pointer.SchemaVersion != 1 || pointer.ElectionID != s.ElectionID || !ValidID(pointer.Generation) {
		return s, "", errors.New("invalid active generation")
	}
	folder := filepath.Join(s.DataDir, "releases", s.ElectionID, pointer.Generation)
	var manifest releasePointer
	if err := readJSON(filepath.Join(folder, "manifest.json"), &manifest); err != nil {
		return s, "", err
	}
	if manifest != pointer {
		return s, "", errors.New("generation manifest mismatch")
	}
	s.DataDir = filepath.Join(folder, "data")
	content := filepath.Join(folder, "content")
	if info, err := os.Stat(filepath.Join(content, s.ElectionID)); err == nil && info.IsDir() {
		s.ContentDir = content
	}
	return s, pointer.Generation, nil
}
