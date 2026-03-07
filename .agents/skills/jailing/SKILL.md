# 🔱 SANDBOX JAILING SKILL (v1.0)

## MANDATE
Execute untrusted Python skills in a restricted, isolated Docker environment to ensure system integrity and resource containment.

## LOGIC PROTOCOL
1. **PHYSICAL ISOLATION**: Spin up a Docker container with networking disabled (or bridged for hunters).
2. **RESOURCE CAPPING**: Enforce strict limits on RAM (128m) and CPU (0.5).
3. **ZOMBIE CONTAINMENT**: Brute-force removal of containers upon timeout or completion.
4. **CROSS-PLATFORM MAPPING**: Handle volume mapping between Windows host and Linux container.

## USAGE
`cstar jailing --run <path> [--args <list>] [--hunting]`
