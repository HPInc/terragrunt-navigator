#!/bin/bash

unset GITHUB_TOKEN

INSTALL=0
PRE_RELEASE=0
RELEASE=1
DEVELOPMENT=0

while getopts ":iprd" OPT; do
  case ${OPT} in
    i)
      INSTALL=1
      ;;
    p)
      PRE_RELEASE=1
      ;;
    r)
      RELEASE=1
      ;;
    d)
      DEVELOPMENT=1
      ;;
    *)
      usage
      ;;
  esac
done

# copy all files to dist
declare FILES=(
  .vscodeignore
  CHANGELOG
  LICENSE
  LICENSE.txt
  README.md
  webpack.config.js
  package-lock.json
  package.json
  icon.png
  extension.js
  parser.js
  terraform.js
  terragrunt.js
  hclLexer.g4
  hclParser.g4
  get-code.sh)

mkdir -p dist
cp -af "${FILES[@]}" dist
cd dist || exit 1

if [ $INSTALL -eq 1 ]; then
  npm install -g @vscode/vsce
  npm install -g webpack-cli
  npm install -g webpack
  npm install -g prettier
fi

npm install
npm run compile
if [ $DEVELOPMENT -eq 1 ]; then
  npm run build:dev
  npx webpack --mode development
else
  npm run build:prod
  npx webpack --mode production
fi

rm -f ./*.vsix

#VERSION=$(jq -Mr .version package.json)
if [ $RELEASE -eq 1 ]; then
  if [ $PRE_RELEASE -eq 1 ]; then
    vsce package --pre-release
  else
    vsce package
  fi
  #scp "ado-pipeline-navigator-${VERSION}.vsix" tools:/var/www/html/files/ado-pipeline-navigator.vsix
  #code --install-extension "ado-pipeline-navigator-${VERSION}.vsix"
  #vsce publish --pre-release
fi

rm -f ../*.vsix
mv ./*.vsix ../
