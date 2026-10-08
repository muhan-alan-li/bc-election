package main

import (
	"os"
	"runtime"
	"testing"
)

const localFinderPath = "../ingestion/storage/published/finder.json"

func BenchmarkFinderLoad(b *testing.B) {
	if _, err := os.Stat(localFinderPath); err != nil {
		b.Skip("Local finder data absent")
	}
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	b.ReportAllocs()
	b.ResetTimer()
	var current *finderData
	for i := 0; i < b.N; i++ {
		var err error
		current, err = loadFinder(localFinderPath)
		if err != nil {
			b.Fatal(err)
		}
	}
	b.StopTimer()
	runtime.GC()
	runtime.ReadMemStats(&after)
	runtime.KeepAlive(current)
	b.ReportMetric(float64(after.HeapAlloc-before.HeapAlloc), "retained-bytes")
}
func BenchmarkFinderPostalMatch(b *testing.B) {
	data, err := loadFinder(localFinderPath)
	if os.IsNotExist(err) {
		b.Skip("Local finder data absent")
	}
	if err != nil {
		b.Fatal(err)
	}
	points := data.PostalCodes["V6Y1N9"]
	b.ReportMetric(float64(len(points.GeoNames)+len(points.StatCan)), "points/lookup")
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, f := range data.Boundaries.Features {
			found := false
			for _, sourcePoints := range [][]locationPoint{points.GeoNames, points.StatCan} {
				for _, p := range sourcePoints {
					if f.matches(p, 0) {
						found = true
						break
					}
				}
				if found {
					break
				}
			}
		}
	}
}
func BenchmarkFinderCoordinateMatch(b *testing.B) {
	data, err := loadFinder(localFinderPath)
	if os.IsNotExist(err) {
		b.Skip("Local finder data absent")
	}
	if err != nil {
		b.Fatal(err)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, f := range data.Boundaries.Features {
			f.matches(locationPoint{-123.14, 49.17}, 50)
		}
	}
}
func BenchmarkFinderPostalAPI(b *testing.B) {
	if _, err := os.Stat(localFinderPath); err != nil {
		b.Skip("Local finder data absent")
	}
	handler := newFinderHandler("../ingestion/storage/published", "bc-provincial-2026")
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
