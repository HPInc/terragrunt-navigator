#!/bin/bash

SRC_DIR="${PWD}"
node ./terragrunt.js tests/env/region/cluster/terragrunt.hcl | sed "s#${SRC_DIR}#TERRAGRUNT_NAVIGATOR_SRC_DIR#g" >/tmp/result.txt
if ! diff -u tests/expected-results/1.txt /tmp/result.txt; then
  echo -e "\e[31mTest failed\e[0m"
fi
