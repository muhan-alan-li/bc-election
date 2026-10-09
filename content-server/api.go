package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

type district struct {
	ID             string `json:"id"`
	Code           string `json:"official_code"`
	Name           string `json:"name"`
	RosterStatus   string `json:"roster_status"`
	CandidateCount int    `json:"candidate_count"`
}

// Expose the public dataset, excluding collection tasks, identity leads and cache paths.
type dataset struct {
	SchemaVersion int    `json:"schema_version"`
	GeneratedAt   string `json:"generated_at"`
	Election      struct {
		ID         string  `json:"id"`
		Title      string  `json:"title"`
		VotingDate *string `json:"voting_date"`
		SourceURL  string  `json:"source_url"`
	} `json:"election"`
	District    district          `json:"district"`
	People      []json.RawMessage `json:"people"`
	Parties     []json.RawMessage `json:"parties"`
	Candidacies []struct {
		ID          string          `json:"id"`
		PersonID    string          `json:"person_id"`
		ElectionID  string          `json:"election_id"`
		DistrictID  string          `json:"district_id"`
		BallotName  string          `json:"ballot_name"`
		PartyID     *string         `json:"party_id"`
		Affiliation string          `json:"affiliation"`
		Status      string          `json:"status"`
		Source      json.RawMessage `json:"source"`
	} `json:"candidacies"`
	Votes       []json.RawMessage `json:"votes"`
	Disclosures []json.RawMessage `json:"disclosures"`
	Interests   []json.RawMessage `json:"interests"`
	Coverage    []json.RawMessage `json:"coverage"`
}

func loadDataset(path, electionID, code string) (dataset, error) {
	var data dataset
	body, err := os.ReadFile(path)
	if err != nil {
		return data, err
	}
	if err = json.Unmarshal(body, &data); err != nil {
		return data, err
	}
	if data.SchemaVersion != 2 || data.Election.ID != electionID || data.District.Code != code || data.District.ID == "" || data.District.Name == "" {
		return data, errors.New("invalid constituency dataset envelope")
	}
	if data.People == nil || data.Parties == nil || data.Candidacies == nil || data.Votes == nil || data.Disclosures == nil || data.Interests == nil || data.Coverage == nil {
		return data, errors.New("missing dataset arrays")
	}
	people, err := entityIDs(data.People)
	if err != nil {
		return data, err
	}
	parties, err := entityIDs(data.Parties)
	if err != nil {
		return data, err
	}
	seen := map[string]bool{}
	for _, candidate := range data.Candidacies {
		if candidate.ID == "" || seen[candidate.ID] || candidate.BallotName == "" || !people[candidate.PersonID] || candidate.ElectionID != electionID || candidate.DistrictID != data.District.ID {
			return data, errors.New("invalid candidacy references")
		}
		seen[candidate.ID] = true
		switch candidate.Affiliation {
		case "party":
			if candidate.PartyID == nil || !parties[*candidate.PartyID] {
				return data, errors.New("invalid party reference")
			}
		case "independent", "unaffiliated":
			if candidate.PartyID != nil {
				return data, errors.New("unexpected party reference")
			}
		default:
			return data, errors.New("invalid affiliation")
		}
	}
	for _, records := range [][]json.RawMessage{data.Votes, data.Disclosures, data.Interests, data.Coverage} {
		for _, raw := range records {
			var record struct {
				PersonID string `json:"person_id"`
			}
			if json.Unmarshal(raw, &record) != nil || !people[record.PersonID] {
				return data, errors.New("invalid record person reference")
			}
		}
	}
	data.District.CandidateCount = len(data.Candidacies)
	return data, nil
}

func entityIDs(records []json.RawMessage) (map[string]bool, error) {
	ids := map[string]bool{}
	for _, raw := range records {
		var entity struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(raw, &entity) != nil || entity.ID == "" || ids[entity.ID] {
			return nil, errors.New("invalid or duplicate entity ID")
		}
		ids[entity.ID] = true
	}
	return ids, nil
}

func newHandler(clientDir, dataDir, electionID string, finderURLs ...string) http.Handler {
	mux := http.NewServeMux()
	finderURL := "http://127.0.0.1:8001"
	if len(finderURLs) > 0 {
		finderURL = finderURLs[0]
	}
	registerFinderProxy(mux, finderURL)
	registerPlatforms(mux, dataDir, electionID)
	apiError := func(w http.ResponseWriter, status int, message string) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
	}
	folder := filepath.Join(dataDir, electionID)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, r, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/districts", func(w http.ResponseWriter, r *http.Request) {
		if !safeID.MatchString(electionID) {
			apiError(w, 503, "Election configuration is invalid.")
			return
		}
		entries, err := os.ReadDir(folder)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Print(err)
			apiError(w, 503, "Constituency data is unavailable.")
			return
		}
		districts := []district{}
		for _, entry := range entries {
			code := strings.TrimSuffix(entry.Name(), ".json")
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") || !safeID.MatchString(code) {
				continue
			}
			data, err := loadDataset(filepath.Join(folder, entry.Name()), electionID, code)
			if err != nil {
				log.Print(err)
				apiError(w, 503, "Published constituency data needs attention.")
				return
			}
			if query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q"))); query != "" && !strings.Contains(strings.ToLower(data.District.Name), query) && !strings.Contains(strings.ToLower(code), query) {
				continue
			}
			districts = append(districts, data.District)
		}
		sort.Slice(districts, func(i, j int) bool { return districts[i].Name < districts[j].Name })
		writeJSON(w, r, map[string]any{"election_id": electionID, "districts": districts})
	})
	mux.HandleFunc("GET /api/districts/{code}", func(w http.ResponseWriter, r *http.Request) {
		code := strings.ToUpper(r.PathValue("code"))
		if !safeID.MatchString(electionID) || !safeID.MatchString(code) {
			apiError(w, 404, "Constituency not found.")
			return
		}
		data, err := loadDataset(filepath.Join(folder, code+".json"), electionID, code)
		if errors.Is(err, os.ErrNotExist) {
			apiError(w, 404, "This constituency has not been published yet.")
			return
		}
		if err != nil {
			log.Print(err)
			apiError(w, 503, "Published constituency data needs attention.")
			return
		}
		writeJSON(w, r, data)
	})
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { apiError(w, 404, "API endpoint not found.") })
	mux.Handle("/", http.FileServer(http.Dir(clientDir)))
	return mux
}

func writeJSON(w http.ResponseWriter, r *http.Request, value any) {
	body, err := json.Marshal(value)
	if err != nil {
		http.Error(w, "Could not encode response", 500)
		return
	}
	etag := fmt.Sprintf(`"%x"`, sha256.Sum256(body))
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("ETag", etag)
	for _, tag := range strings.Split(r.Header.Get("If-None-Match"), ",") {
		if strings.TrimPrefix(strings.TrimSpace(tag), "W/") == etag || strings.TrimSpace(tag) == "*" {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	_, _ = w.Write(body)
}
