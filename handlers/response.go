package handlers

import (
	"encoding/json"
	"log"
	"net/http"
)

// APIResponse struct for consistent JSON responses
type APIResponse struct {
	Message string      `json:"message"`
	Status  string      `json:"status"` // e.g., "success", "error"
	Data    interface{} `json:"data,omitempty"`
}

// respondWithJSON sends a JSON response
func respondWithJSON(w http.ResponseWriter, statusCode int, payload interface{}) {
	response, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshalling JSON: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	w.Write(response)
}

// errorResponse sends an error JSON response
func errorResponse(w http.ResponseWriter, message string, statusCode int) {
	respondWithJSON(w, statusCode, APIResponse{
		Message: message,
		Status:  "error",
	})
}

// successResponse sends a success JSON response
func successResponse(w http.ResponseWriter, message string, data interface{}) {
	respondWithJSON(w, http.StatusOK, APIResponse{
		Message: message,
		Status:  "success",
		Data:    data,
	})
}