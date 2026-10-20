package finder

import (
	"errors"
	"strings"
)

type Input struct {
	PostalCode string   `json:"postal_code"`
	Latitude   *float64 `json:"latitude"`
	Longitude  *float64 `json:"longitude"`
	Accuracy   float64  `json:"accuracy_m"`
}

func (input *Input) Normalize() error {
	input.PostalCode = strings.ToUpper(strings.Join(strings.Fields(input.PostalCode), ""))
	postal := input.PostalCode
	if (postal != "" && (input.Latitude != nil || input.Longitude != nil || input.Accuracy != 0)) || (postal == "" && (input.Latitude == nil || input.Longitude == nil)) {
		return errors.New("Provide either a postal code or coordinates.")
	}
	if postal != "" && !postalPattern.MatchString(postal) {
		return errors.New("Enter a full British Columbia postal code, such as V6Y 1N9.")
	}
	if input.Accuracy < 0 || input.Accuracy > 100000 {
		return errors.New("Location accuracy must be between 0 and 100,000 metres.")
	}
	if postal == "" && !validLocation(locationPoint{*input.Longitude, *input.Latitude}) {
		return errors.New("Location coordinates are invalid.")
	}
	return nil
}
