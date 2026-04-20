# Model Selection

Lucy QA now includes an initial model-selection layer.

## Recommended real-world flow
The correct long-term flow should be:
1. select provider
2. authenticate / connect to provider
3. discover available models from the live provider when possible
4. let the user choose a main default model
5. optionally store task-specific preferences after that

So yes: provider choice should normally come before model choice, and live model discovery should override stale static assumptions whenever the backend supports it.

## Supported config fields
Per provider:
- `model`
- `default_model`
- `available_models`
- `model_aliases`
- `task_model_preferences`

## Important design rule
Lucy QA should not hard-lock QA work to a single pair such as:
- `qa_default -> gemini-2.5-pro`
- `qa_fast -> gemini-2.5-flash`

Instead, model aliases should be generic and portable, while task preferences should be configurable per provider.

Recommended generic aliases:
- `balanced`
- `fast`
- `deep_reasoning`
- `long_context`
- provider-specific aliases only when explicitly needed

## Resolution order
When a user requests a model, Lucy QA resolves it in this order:
1. explicit `--model` request, including alias expansion through `model_aliases`
2. task preference candidates from `task_model_preferences`
3. persisted user-selected default model for that provider
4. provider `default_model`
5. provider `model`

If live-discovered models exist, Lucy QA validates against the merged set of:
- discovered models from provider state
- configured `available_models`

This lets the runtime accept newly discovered models even if the original static config was stale.

## Task-level routing
A provider may optionally define `task_model_preferences`, for example:
- qa
- research
- coding
- uiux

This means QA can prefer a ranked list of candidate models rather than being tied to one fixed model.

## Validation
If `available_models` is defined, the resolved model must exist in that list.

## Example
For `gcli2api-local`:
- `--model fast` -> `gemini-2.5-flash`
- `--model deep_reasoning` -> `glm-4.5`
- `--model coding_alibaba` -> `qwen-max`

## Codex-specific note
For the native Codex provider, static model lists should be treated as a seed only.
Preferred sources of truth are:
1. `~/.codex/models_cache.json`
2. live discovered provider models
3. config fallback values only if the above are unavailable

This avoids shipping stale Codex model lists as OpenAI updates the recommended lineup.

## Current CLI examples
- `lucy provider show gcli2api-local --model fast`
- `lucy ask "hello" --provider gcli2api-local --model deep_reasoning`
- `lucy provider models openai-codex`
- `lucy ask "hello" --provider openai-codex --model gpt-5.4-mini`
