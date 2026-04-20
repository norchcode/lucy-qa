# Model Selection Notes

Rules:
- Each provider can define `default_model`
- Each provider can define `available_models`
- Each provider can define `model_aliases`
- User-requested model names should first resolve through aliases, then validate against available models
