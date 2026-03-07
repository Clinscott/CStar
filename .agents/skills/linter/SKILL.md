# 🔱 PROMPT INTEGRITY LINTER SKILL (v1.0)

## MANDATE
Ensure high-fidelity prompt engineering by verifying variable synchronization between `.prompty` files and their Python invocations.

## LOGIC PROTOCOL
1. **VARIABLE EXTRACTION**: Parse `.prompty` files to identify all expected `{{variables}}`.
2. **AST AUDIT**: Perform abstract syntax tree analysis on Python code to ensure all expected variables are passed during invocation.
3. **INTEGRITY SCORING**: Calculate a project-wide prompt health score based on error-free prompt definitions.
4. **COMPLIANCE CHECK**: Halt execution if a mission-critical prompt is missing required data bindings.

## USAGE
`cstar linter --score [--dir <path>]`
`cstar linter --audit --file <path> --vars <list>`
