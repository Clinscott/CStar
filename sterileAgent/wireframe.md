# Wireframe Maintenance Instructions

The `wireframe.md` file acts as the project's map. It provides future agents and developers with an immediate understanding of the project's structure, component locations, and key logic.

## Goal
Maintain a searchable, accurate map of the project's UI and service architecture.

## Maintenance Rules
1. **Document Every New Component**: Whenever you create a new UI component or major service, add its entry to `wireframe.md`.
2. **File Paths**: Use absolute or clear relative paths for every entry so they are easily locatable.
3. **Prominent Functions**: For each component, explicitly name and describe 2-3 key functions.
   - *Example*: `handleSubmit()`: Validates registration form and triggers API call.
4. **Project Directory Structure**: Keep a high-level list of key directories and their purposes.
5. **No Placeholders**: If a component exists, it must be documented. If it's deleted, remove it from the map.

## Template
```markdown
# Project Map / Wireframe

## 📂 Directory Structure
- `src/components`: UI Components
- `src/lib`: Logic and Utilities
- `src/app`: Routes and Page Views (Next.js)

## 🏗️ Core Components
### [Component Name]
- **Path**: `path/to/component.tsx`
- **Description**: Brief summary of purpose.
- **Key Functions**:
    - `functionName()`: Description of logic.
```
