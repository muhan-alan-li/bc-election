package main

import (
	"flag"
	"log"

	"bc-election/constituency-finder/internal/finder"
)

func main() {
	dataset := flag.String("dataset", "../ingestion/storage/published/finder.json", "validated finder dataset")
	catalog := flag.String("catalog", "../client/dist-static/data/districts.json", "exported voter catalog")
	out := flag.String("out", "../client/dist-static", "site output directory")
	flag.Parse()
	if err := finder.ExportStatic(*dataset, *catalog, *out); err != nil {
		log.Fatal(err)
	}
}
