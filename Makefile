.DEFAULT_GOAL := help

PORT ?= 8080

.PHONY: help setup build data results refresh-results finder-data refresh-finder-data dev preview test test-browser check format clean

FINDER_DATA := ingestion/storage/published/finder.json

help:
	@echo "make setup       Install client dependencies"
	@echo "make build       Export data, build the finder, and bundle the static site"
	@echo "make data        Build the roster, results, and historical riding totals"
	@echo "make results     Rebuild the results publication from cached sources"
	@echo "make refresh-results Re-download results and historical totals"
	@echo "make finder-data Build finder data if it is missing"
	@echo "make refresh-finder-data Re-download finder source data"
	@echo "make dev         Watch client sources and serve client/dist-static at http://localhost:$(PORT)"
	@echo "make preview     Serve client/dist-static at http://localhost:$(PORT)"
	@echo "make test        Run Python and client unit tests"
	@echo "make test-browser Run the static browser regression suite"
	@echo "make check       Run formatting checks and all non-browser tests"
	@echo "make clean       Remove generated static output"
	@echo "make format      Format client source"

setup:
	cd client && npm install
	touch client/node_modules/.installed

client/node_modules/.installed: client/package.json client/package-lock.json
	cd client && npm install
	touch client/node_modules/.installed

data:
	cd ingestion && python3 -m election build
	cd ingestion && python3 -m election build-results

results:
	cd ingestion && python3 -m election build-results

refresh-results:
	cd ingestion && python3 -m election --refresh build-results

finder-data: $(FINDER_DATA)

$(FINDER_DATA):
	cd ingestion && python3 -m election build-finder

refresh-finder-data:
	cd ingestion && python3 -m election --refresh build-finder

build: client/node_modules/.installed data finder-data
	cd client && npm run build

dev: client/node_modules/.installed
	@test -d ingestion/storage/published || { \
		echo "Missing ingestion/storage/published. Run 'make build' first."; \
		exit 1; \
	}
	@cd client && { \
		npm run dev & \
		watch_pid=$$!; \
		trap 'kill $$watch_pid 2>/dev/null' EXIT INT TERM; \
		for i in $$(seq 1 120); do \
			[ -f dist-static/index.html ] && break; \
			kill -0 $$watch_pid 2>/dev/null || exit 1; \
			sleep 0.5; \
		done; \
		echo "Dev site: http://localhost:$(PORT)"; \
		python3 -m http.server "$(PORT)" --bind 127.0.0.1 --directory dist-static; \
	}

preview:
	cd client && python3 -m http.server "$(PORT)" --directory dist-static

test:
	cd ingestion && python3 -m unittest discover -s tests
	cd client && npm test

test-browser: client/node_modules/.installed
	cd client && npm run test:browser

check: client/node_modules/.installed
	cd client && npm run format:check
	$(MAKE) test

format: client/node_modules/.installed
	cd client && npm run format

clean:
	rm -rf client/dist-static client/.static-build-*
