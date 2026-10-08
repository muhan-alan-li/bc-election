package main

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestFinderProxy(t *testing.T) {
	mux := http.NewServeMux()
	registerFinderProxy(mux, "http://finder.internal:8001", roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "finder.internal:8001" || r.URL.Path != "/api/constituency-finder" || r.Method != "POST" {
			t.Fatal("Incorrect forwarding", r.URL, r.Method)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		if string(body) != `{"postal_code":"V6Y1N9"}` {
			t.Fatal("Changed request", string(body))
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/json"}, "Cache-Control": {"no-store"}}, Body: io.NopCloser(strings.NewReader(`{"status":"approximate","districts":[{"official_code":"RCC"}]}`))}, nil
	}))
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest("POST", "/api/constituency-finder", strings.NewReader(`{"postal_code":"V6Y1N9"}`)))
	if response.Code != 200 || !strings.Contains(response.Body.String(), "RCC") || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(response.Code, response.Body.String())
	}
}
func TestFinderProxyUnavailable(t *testing.T) {
	mux := http.NewServeMux()
	registerFinderProxy(mux, "http://finder.internal:8001", roundTripFunc(func(r *http.Request) (*http.Response, error) { return nil, errors.New("unreachable") }))
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest("POST", "/api/constituency-finder", strings.NewReader(`{}`)))
	if response.Code != 503 || !strings.Contains(response.Body.String(), "service is unavailable") {
		t.Fatal(response.Code, response.Body.String())
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("Error cached")
	}
}
