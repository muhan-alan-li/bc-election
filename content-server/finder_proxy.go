package main

import (
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"
)

func registerFinderProxy(mux *http.ServeMux, finderURL string, transports ...http.RoundTripper) {
	target, err := url.Parse(finderURL)
	unavailable := func(w http.ResponseWriter, r *http.Request, err error) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "The constituency finder service is unavailable. Try again shortly or use Elections BC’s district finder."})
	}
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		mux.HandleFunc("POST /api/constituency-finder", func(w http.ResponseWriter, r *http.Request) { unavailable(w, r, err) })
		return
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 10 * time.Second
	transport.MaxIdleConnsPerHost = 4
	proxy.Transport = transport
	if len(transports) > 0 {
		proxy.Transport = transports[0]
	}
	proxy.ErrorHandler = unavailable
	// Stream responses rather than loading boundary geometry into the main server.
	mux.Handle("POST /api/constituency-finder", proxy)
}
