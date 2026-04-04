#pragma once
// Placeholder TFLite flatbuffer — replace with trained model.
// To regenerate: python firmware/models/train_placeholder.py
// Then: xxd -i model.tflite > firmware/lib/inference/model_data.h
//
// This placeholder is a minimal TFLite magic header + zeroed bytes.
// Used only in non-SIMULATION_MODE (real ESP32 env).
// In SIMULATION_MODE the model is not loaded — vibration-based formula is used instead.

extern const unsigned char g_model_data[];
extern const int           g_model_data_len;
