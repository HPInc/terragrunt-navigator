#!/bin/bash

set -x
# redirect stdout/stderr to a file
exec >/tmp/get-code.log 2>&1
REPO_URL="$1"
REF="$2"
REPO_PATH="$3"

fetch_head_path() {
  local path="$1"
  cd "${path}" || exit 1
  cd .git || exit 1
  path=$(readlink -f HEAD)
  if [[ "$OSTYPE" == "cygwin" || "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    "$(cygpath -w "$path")"
  else
    echo "$path"
  fi
}

REPO_PATH="${REPO_PATH%.git}"
repo_name=$(basename "${REPO_PATH}")
dir_path=$(dirname "${REPO_PATH}")
fetch_head="$(fetch_head_path "${REPO_PATH}")"

mkdir -p "${dir_path}"
cd "${dir_path}" || exit 1
echo "Getting code from ${REPO_URL} to ${REPO_PATH} with ref ${REF}"
if [ -f "${fetch_head}" ]; then
  cd "${REPO_PATH}" || exit 1
  # Update only if last updated time is more that one day
  last_fetch_time=$(stat -c %Y "${fetch_head}")
  current_time=$(date +%s)
  time_diff=$((current_time - last_fetch_time))
  if [ "${time_diff}" -gt 86400 ]; then
    git fetch
    git checkout "${REF}"
    git pull
  else
    echo "Not fetching code as last fetch was less than a day ago"
    git checkout "${REF}"
  fi
else
  rm -rf "${repo_name}"
  git clone "${REPO_URL}" "${REPO_PATH}"
  cd "${REPO_PATH}" || exit 1
  git checkout "${REF}"
fi
