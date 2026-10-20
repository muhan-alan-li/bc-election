package httpapi

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"
)

func registerFinderProxy(mux *http.ServeMux, finderURL string, transport http.RoundTripper) {
	target, err := url.Parse(finderURL)
	unavailable := func(w http.ResponseWriter, r *http.Request, err error) {
		apiError(w, http.StatusServiceUnavailable, "The constituency finder service is unavailable. Try again shortly or use Elections BC’s district finder.")
	}
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		mux.HandleFunc("POST /api/constituency-finder", func(w http.ResponseWriter, r *http.Request) { unavailable(w, r, err) })
		return
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	if transport == nil {
		defaultTransport := http.DefaultTransport.(*http.Transport).Clone()
		defaultTransport.ResponseHeaderTimeout = 10 * time.Second
		defaultTransport.MaxIdleConnsPerHost = 4
		transport = defaultTransport
	}
	proxy.Transport = transport
	proxy.ErrorHandler = unavailable
	// Stream responses rather than loading boundary geometry into the main server.
	mux.Handle("POST /api/constituency-finder", proxy)
}
