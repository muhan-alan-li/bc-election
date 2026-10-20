package httpapi

import (
	"os"
	"testing"
)

func BenchmarkFinderPostalAPI(b *testing.B) {
	if _, err := os.Stat("../../../ingestion/storage/published/finder.json"); err != nil {
		b.Skip("Local finder data absent")
	}
	handler := NewHandler(Config{DataDir: "../../../ingestion/storage/published", ElectionID: "bc-provincial-2026"})
	if got := finderRequest(handler, `{"postal_code":"V6Y1N9"}`); got.Code != 200 {
		b.Fatal(got.Code)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if got := finderRequest(handler, `{"postal_code":"V6Y1N9"}`); got.Code != 200 {
			b.Fatal(got.Code)
		}
	}
}
