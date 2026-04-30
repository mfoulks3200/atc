#!/usr/bin/env bash
set -euo pipefail

SPEC="docs/specification.md"

count_rules() {
  grep -oE 'RULE-[A-Z]+-[0-9]+[a-z]?' "$1" | sort -u | wc -l | tr -d ' '
}

list_rules() {
  grep -oE 'RULE-[A-Z]+-[0-9]+[a-z]?' "$1" | sort -u
}

BASE_REF="${1:-origin/main}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "Base ref '$BASE_REF' not found. Usage: $0 [base-ref]"
  exit 1
fi

if ! git diff --name-only "$BASE_REF"...HEAD | grep -q "^${SPEC}$"; then
  echo "No changes to $SPEC — skipping rule-count check."
  exit 0
fi

BASE_SPEC=$(git show "${BASE_REF}:${SPEC}" 2>/dev/null) || {
  echo "$SPEC does not exist on $BASE_REF — skipping comparison (new file)."
  exit 0
}

BASE_COUNT=$(echo "$BASE_SPEC" | grep -oE 'RULE-[A-Z]+-[0-9]+[a-z]?' | sort -u | wc -l | tr -d ' ')
HEAD_COUNT=$(count_rules "$SPEC")

echo "Rule count — base ($BASE_REF): $BASE_COUNT, head: $HEAD_COUNT"

if [ "$HEAD_COUNT" -lt "$BASE_COUNT" ]; then
  DROPPED=$((BASE_COUNT - HEAD_COUNT))
  echo ""
  echo "ERROR: $DROPPED rule(s) dropped from $SPEC."
  echo ""
  echo "Dropped rules:"
  diff <(echo "$BASE_SPEC" | grep -oE 'RULE-[A-Z]+-[0-9]+[a-z]?' | sort -u) \
       <(list_rules "$SPEC") \
    | grep '^< ' | sed 's/^< /  /'
  echo ""
  echo "If this removal is intentional, include [rule-removal] in the PR description."

  PR_BODY="${PR_BODY:-}"
  if echo "$PR_BODY" | grep -q '\[rule-removal\]'; then
    echo ""
    echo "[rule-removal] marker found in PR description — allowing decrease."
    exit 0
  fi

  exit 1
fi

echo "Rule count check passed."
