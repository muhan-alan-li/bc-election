package finder

import (
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
