#!/bin/bash

SKIP_DEBUG_DIFF=false

# Parse command-line options
while getopts "d" opt; do
  case ${opt} in
    d)
      SKIP_DEBUG_DIFF=true
      ;;
    \?)
      echo "Usage: cmd [-d]"
      exit 1
      ;;
  esac
done

SRC_DIR="${PWD}"
node ./terragrunt.js -f tests/env/region/cluster/terragrunt.hcl -r -k 2>tests/debug.txt >tests/output.txt

sed -i "s#${SRC_DIR}#TERRAGRUNT_NAVIGATOR_SRC_DIR#g" tests/output.txt
if ! diff -u tests/expected-results/output.txt tests/output.txt; then
  echo -e "\e[31mTest failed\e[0m"
fi

if [ "$SKIP_DEBUG_DIFF" = true ]; then
  exit 0
fi

sed -i "s#${SRC_DIR}#TERRAGRUNT_NAVIGATOR_SRC_DIR#g" tests/debug.txt
if ! diff -u tests/expected-results/debug.txt tests/debug.txt; then
  echo -e "\e[31mDebug failed\e[0m"
fi
