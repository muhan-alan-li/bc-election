package main

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLazyLoadAndRecovery(t *testing.T) {
	var calls atomic.Int32
	loader := &lazyFinder{load: func() (*finderData, error) { calls.Add(1); return &finderData{}, nil }}
	var group sync.WaitGroup
	for i := 0; i < 20; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, err := loader.get(); err != nil {
				t.Error(err)
			}
		}()
	}
	group.Wait()
	if calls.Load() != 1 {
		t.Fatal("Dataset loaded more than once")
	}
	failing := &lazyFinder{load: func() (*finderData, error) { return nil, errors.New("missing") }}
	if _, err := failing.get(); err == nil {
		t.Fatal("Expected unavailable")
	}
	failing.load = func() (*finderData, error) { return &finderData{}, nil }
	if _, err := failing.get(); err == nil {
		t.Fatal("Retry cooldown ignored")
	}
	failing.retryAfter = time.Time{}
	if _, err := failing.get(); err != nil {
		t.Fatal("Cannot recover", err)
	}
}
func TestBoundedPostalCache(t *testing.T) {
	cache := newPostalCache(2, time.Minute)
	cache.put("a", []int{1})
	cache.put("b", []int{2})
	cache.get("a")
	cache.put("c", []int{3})
	if _, ok := cache.get("b"); ok {
		t.Fatal("Least recently used entry not evicted")
	}
	if values, ok := cache.get("a"); !ok || values[0] != 1 {
		t.Fatal("Unexpected cache contents")
	}
	cache.put("a", []int{4})
	if values, _ := cache.get("a"); values[0] != 4 {
		t.Fatal("Update failed")
	}
	expired := newPostalCache(1, -time.Second)
	expired.put("a", nil)
	if _, ok := expired.get("a"); ok {
		t.Fatal("Expired result reused")
	}
	if len(expired.entries) != 0 {
		t.Fatal("Expired entry retained")
	}
}
