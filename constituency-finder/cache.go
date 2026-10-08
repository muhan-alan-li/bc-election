package main

import (
	"container/list"
	"sync"
	"time"
)

// Only one request loads the dataset. A failed load can be retried after a short cooldown.
type lazyFinder struct {
	mu         sync.Mutex
	data       *finderData
	load       func() (*finderData, error)
	err        error
	retryAfter time.Time
}

func (f *lazyFinder) get() (*finderData, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.data != nil {
		return f.data, nil
	}
	if f.err != nil && time.Now().Before(f.retryAfter) {
		return nil, f.err
	}
	f.data, f.err = f.load()
	if f.err != nil {
		f.retryAfter = time.Now().Add(5 * time.Second)
	}
	return f.data, f.err
}

// Cache only matching boundary indices, never geometry, response bodies, or user coordinates.
type postalCacheEntry struct {
	code    string
	indices []int
	expires time.Time
}
type postalCache struct {
	mu       sync.Mutex
	entries  map[string]*list.Element
	order    list.List
	capacity int
	ttl      time.Duration
}

func newPostalCache(capacity int, ttl time.Duration) *postalCache {
	return &postalCache{entries: make(map[string]*list.Element), capacity: capacity, ttl: ttl}
}
func (c *postalCache) get(code string) ([]int, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	element, ok := c.entries[code]
	if !ok {
		return nil, false
	}
	entry := element.Value.(postalCacheEntry)
	if !time.Now().Before(entry.expires) {
		c.order.Remove(element)
		delete(c.entries, code)
		return nil, false
	}
	c.order.MoveToFront(element)
	return entry.indices, true
}
func (c *postalCache) put(code string, indices []int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.capacity <= 0 {
		return
	}
	entry := postalCacheEntry{code, append([]int(nil), indices...), time.Now().Add(c.ttl)}
	if element, ok := c.entries[code]; ok {
		element.Value = entry
		c.order.MoveToFront(element)
		return
	}
	c.entries[code] = c.order.PushFront(entry)
	if c.order.Len() > c.capacity {
		old := c.order.Back()
		delete(c.entries, old.Value.(postalCacheEntry).code)
		c.order.Remove(old)
	}
}
