# Local PC Metadata-Only Inventory

Run this only on the PC that contains the Hermes profile. Run it once with
`<HERMES_PROFILE_ROOT>` set to the Forge profile and once for Researcher.

This first pass reads directory metadata only. It does not print file contents,
hash excluded material, create an archive, copy profile files, inspect OAuth
state, or traverse known runtime-data directories.

## Command

Replace the first two placeholders. Keep the quotation marks. For a developed
profile whose code sits outside the standard source roots, set
`additional_source_root` to one operator-approved relative path. Otherwise,
leave it empty.

```bash
profile_root="<HERMES_PROFILE_ROOT>"
output_dir="<SAFE_INTAKE_OUTPUT_DIR>"
additional_source_root=""

test -d "$profile_root" || {
  echo "Profile root not found" >&2
  exit 1
}

case "$additional_source_root" in
  "" ) ;;
  /*|~*|[A-Za-z]:*|*\\*|../*|*/../*|*/..|.|*//* )
    echo "Additional source root must be one normalized relative path" >&2
    exit 1
    ;;
esac

mkdir -p "$output_dir"

(
  cd "$profile_root" || exit 1
  candidates=( \
    "SKILL.md" \
    "SOUL.md" \
    "skills" \
    "scripts" \
    "tests" \
    "prompts" \
    "schemas" \
    "templates"
  )
  if [ -n "$additional_source_root" ]; then
    candidates+=("$additional_source_root")
  fi

  for candidate in "${candidates[@]}"; do
    if [ -f "$candidate" ]; then
      stat --printf='%n\t%s\t%Y\n' -- "$candidate"
      continue
    fi
    if [ ! -d "$candidate" ]; then
      continue
    fi
    find "$candidate" \
      \( -type d \( \
        -name ".git" -o -name ".cache" -o -name "__pycache__" -o \
        -name "node_modules" -o -name "logs" -o -name "log" -o \
        -name "sessions" -o -name "session" -o -name "cookies" -o \
        -name "browser-profile" -o -name "memory" -o -name "memories" -o \
        -name "raw" -o -name "sources" -o -name "dossiers" -o \
        -name "knowledge" -o -name "notes" -o -name "decisions" -o \
        -name "queue" -o -name "runs" -o -name "health" -o \
        -name "ops" -o -name "wiki" -o -name "indexes" -o \
        -name "backups" -o -name ".backups" -o -name "vault" -o \
        -name "secrets" -o -name "credentials" -o -name "oauth" \
      \) -prune \) -o \
      \( -type f \
        ! -iname ".env" ! -iname ".env.*" \
        ! -iname "*.key" ! -iname "*.pem" ! -iname "*.p12" ! -iname "*.pfx" \
        ! -iname "*secret*" ! -iname "*credential*" ! -iname "*oauth*" \
        ! -iname "*token*" ! -iname "*cookie*" ! -iname "*session*" \
        ! -iname "*.log" ! -iname "*.db" ! -iname "*.sqlite" \
        ! -iname "*.sqlite3" ! -iname "*.pid" ! -iname "*.lock" \
        -printf '%p\t%s\t%T@\n' \
      \)
  done
) | LC_ALL=C sort -u > "$output_dir/candidate-files.tsv"

wc -l "$output_dir/candidate-files.tsv"
echo "Review metadata only: $output_dir/candidate-files.tsv"
```

The command intentionally does not enumerate the whole profile and does not
write an exclusion ledger. It starts from candidate source roots and prunes
runtime-data names before descending.

## Review Checklist

- Confirm every path in `candidate-files.tsv` is relative.
- Reject any path that identifies a person, account, private matter, or live
  data source.
- Mark `SOUL.md`, prompts, fixtures, and example configuration for manual
  review.
- If an additional source root was approved, confirm it contains only the
  expected reusable profile code.
- Confirm no sibling vault or runtime-data directories appear.
- Confirm there are no `.env`, key, token, credential, OAuth, cookie, session,
  log, database, PID, lock, memory, raw-vault, backup, or generated-data files.
- Do not open excluded material to prove that it is excluded.
- Do not create a tarball, copy files, upload output, or commit anything yet.
- Return only the metadata TSV and a content-free manifest for operator review.

## Stop Conditions

Stop without broadening the command if:

- the developed code is outside the candidate roots;
- a candidate directory mixes source and private runtime data;
- filenames themselves contain private information;
- the profile root or output location is uncertain;
- the inventory suggests that live configuration is required to understand the
  source.

Report the missing code area using a generic relative description. A later,
operator-approved inventory rule can add one precise source root without
scanning the rest of the profile.
