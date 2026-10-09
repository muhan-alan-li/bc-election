.DEFAULT_GOAL := help

PORT ?= 8000
FINDER_PORT ?= 8001

.PHONY: help setup build up down status finder-data test data-curate data-polish data-build

help:
	@echo "make up      Build and restart the app in the background"
	@echo "make down    Stop the app"
	@echo "make status  Check whether the app is running"
	@echo "make build   Build the client and both Go services"
	@echo "make setup   Install client dependencies"
	@echo "make finder-data  Import/update free constituency finder data"
	@echo "make test    Run the Go API and finder tests"
	@echo "make data-build  Curate and polish collected evidence, without downloads"
	@echo "make data-curate Apply reviewed identity and interest records"
	@echo "make data-polish Build client files from curated snapshots"

data-curate:
	cd ingestion && python3 -m election curate

data-polish:
	cd ingestion && python3 -m election polish

data-build:
	cd ingestion && python3 -m election build-data

setup:
	cd client && npm install
	touch client/node_modules/.installed

client/node_modules/.installed: client/package.json
	cd client && npm install
	touch client/node_modules/.installed

build: client/node_modules/.installed
	cd client && npm run build
	cd content-server && go build -o bin/content-server .
	cd constituency-finder && go build -o bin/constituency-finder .

up: build
	sh scripts/app.sh up "$(PORT)" "$(FINDER_PORT)"

down:
	sh scripts/app.sh down "$(PORT)" "$(FINDER_PORT)"

status:
	sh scripts/app.sh status "$(PORT)" "$(FINDER_PORT)"

finder-data:
	cd ingestion && python3 -m election build-finder

test:
	cd content-server && go test ./...
	cd constituency-finder && go test ./...
