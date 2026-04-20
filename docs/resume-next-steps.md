# Resume Next Steps

Current progress:
- v1 spec written
- QA baseline integrated from Mengenal QA v1.8
- repo scaffold created
- provider strategy documented
- provider-loading layer added

Recommended next code step:
1. implement a real provider client interface
2. wire native Codex auth adapter
3. wire OpenAI-compatible HTTP client
4. add one real command flow:
   - user prompt
   - provider selection
   - request execution
   - response printing
5. then build QA plan generation on top of that
