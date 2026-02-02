# Skill: KnowledgeHunter

Activation Words: search, find, where is, how does, research, scour, hunter, documentation

## Instructions
When the user asks "how does X work" or "find where Y is defined", trigger KnowledgeHunter.
1. **Local Scour**: Perform `grep` searches across the codebase.
2. **Web Scour**: Use `search_web` if local results are insufficient.
3. **Synthesis**: Provide a detailed report of findings with file paths.

## Tracing logic
Match this skill if query implies a lack of information or a search intent.
