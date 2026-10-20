// export-static validates a pinned publication and exports only the public site data.
package main

import (
	"flag"
	"log"

	"bc-election/content-server/internal/publication"
	"bc-election/content-server/internal/staticexport"
)

func main() {
	data := flag.String("data-dir", "../ingestion/storage/published", "published data directory")
	content := flag.String("content-dir", "content", "editorial content directory")
	election := flag.String("election", "bc-provincial-2026", "election ID")
	out := flag.String("out", "../client/dist-static", "export directory")
	flag.Parse()
	if err := staticexport.Export(publication.Store{DataDir: *data, ContentDir: *content, ElectionID: *election}, *out); err != nil {
		log.Fatal(err)
	}
}
