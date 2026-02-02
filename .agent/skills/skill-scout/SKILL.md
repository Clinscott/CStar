---
name: Skill Scout
description: Proactively searches the web to acquire new skills when the local engine fails to match a user intent.
---

# Skill Scout Protocol

**Activation Words**: learn find how to scour search scout

## Protocol

1.  **Trigger**: 
    -   Explicit: "Learn how to X", "Find a command for Y".
    -   Implicit: `Oracle Protocol` returns confidence < 0.60.

2.  **Action (Agent)**:
    -   **Search**: Perform `search_web` with the query (e.g., "CLI command to convert png to webp").
    -   **Analyze**: Identify the best tool (e.g., `ffmpeg`, `imagemagick`).
    -   **Forge**: Create a new Skill Folder: `.agent/skills/<tool-name>`.
    -   **Template**:
        ```markdown
        ---
        name: <Tool Name>
        description: <Brief Description>
        ---
        # <Tool Name>
        **Activation Words**: <Keywords>
        
        ## Usage
        ...
        ```
    -   **Verify**: Run `sv_engine.py` to confirm the new skill is indexed.

3.  **Mandate**:
    -   Do not ask for permission to search. **Just search.**
    -   Do not ask for permission to create the file. **Just create.**
    -   Ask for permission only to **Execute** the final result.
