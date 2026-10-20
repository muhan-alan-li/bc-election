package publication

func containsResearchFields(value any) bool {
	switch value := value.(type) {
	case map[string]any:
		for key, item := range value {
			switch key {
			case "blob", "pages", "tasks", "identity_leads":
				return true
			}
			if containsResearchFields(item) {
				return true
			}
		}
	case []any:
		for _, item := range value {
			if containsResearchFields(item) {
				return true
			}
		}
	}
	return false
}
