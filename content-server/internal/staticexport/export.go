package staticexport

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"bc-election/content-server/internal/publication"
)

// Export uses the same validated, normalized models as the public API. It pins
// one generation so data and portraits cannot come from different releases.
// Only public voter data and referenced portraits are exported, never research
// archives, ingestion metadata, or the large finder dataset.
func Export(store publication.Store, out string) error {
	store, generation, err := store.Pin()
	if err != nil {
		return err
	}
	files := map[string][]byte{}
	add := func(name string, value any, err error) error {
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		body, err := json.Marshal(value)
		if err != nil {
			return err
		}
		files[name] = append(body, '\n')
		return nil
	}
	parties, err := store.Parties()
	if err := add("data/parties.json", parties, err); err != nil {
		return err
	}
	guide, err := store.Guide()
	if err := add("data/guide.json", guide, err); err != nil {
		return err
	}
	questions, err := store.Questionnaire()
	if err := add("data/questionnaire.json", questions, err); err != nil {
		return err
	}
	polling, err := store.Polling()
	if err := add("data/polling.json", polling, err); err != nil {
		return err
	}
	districts, err := store.Districts()
	if err != nil {
		return err
	}
	if len(districts) == 0 {
		return fmt.Errorf("no published constituencies; import a publication before building")
	}
	if err := add("data/districts.json", map[string]any{"election_id": store.ElectionID, "districts": districts}, nil); err != nil {
		return err
	}
	for _, district := range districts {
		ballot, err := store.Ballot(district.Code)
		if err := add("data/districts/"+district.Code+"/ballot.json", ballot, err); err != nil {
			return err
		}
	}
	for _, party := range append(guide.Parties, guide.OtherParties...) {
		if party.Portrait == "" {
			continue
		}
		name := strings.TrimPrefix(party.Portrait, "/content/")
		body, err := os.ReadFile(filepath.Join(store.ContentDir, name))
		if err != nil {
			return fmt.Errorf("portrait %s: %w", party.ID, err)
		}
		files["content/"+name] = body
	}
	if err := add("data/publication.json", map[string]string{"election_id": store.ElectionID, "generation": generation}, nil); err != nil {
		return err
	}
	// Complete validation before writing. The build orchestrator stages the whole
	// site separately and promotes it only after esbuild also succeeds.
	for name, body := range files {
		target := filepath.Join(out, name)
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		if err := os.WriteFile(target, body, 0644); err != nil {
			return err
		}
	}
	return nil
}
