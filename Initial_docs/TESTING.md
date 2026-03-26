# Testing Strategy

## Critical Flows
1. **Selection Logic:** Ensure a verb with 10/10 Usefulness and 0.0 Mastery appears twice as often as a 5/10 Usefulness verb.
2. **Grammar Integrity:** Test that a "Noun_F" drill correctly expects an "e" prefix for an accompanying Adjective.
3. **Partial Credit:** Unit test the Levenshtein function: "Pash" should be 0.5 credit for "Pashë".
4. **Data Portability:** Verify that a CSV export matches the user's Google Sheet format exactly.