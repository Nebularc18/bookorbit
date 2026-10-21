#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -ne 4 ]]; then
  echo "usage: $0 <base-repo> <head-repo> <head-branch> <author-association>" >&2
  exit 2
fi

if [[ "$1" != 'bookorbit/bookorbit' && "$1" == "$2" && "$3" =~ ^sync/upstream-main-[0-9]{8}$ && "$4" =~ ^(OWNER|MEMBER|COLLABORATOR)$ ]]; then
  echo true
else
  echo false
fi
