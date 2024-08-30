const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");
const console = require("console");
const { execSync } = require("child_process");
let Terragrunt = require("./parser");

let linkDecator = vscode.window.createTextEditorDecorationType({
  textDecoration: "underline",
  overviewRulerColor: "blue",
  overviewRulerLane: vscode.OverviewRulerLane.Right,
  cursor: "pointer",
  color: "#FFD580",
  after: {
    fontWeight: "bold",
  },
  light: {
    color: "darkorange",
    borderColor: "darkblue",
  },
  dark: {
    color: "lightorange",
    borderColor: "lightblue",
  },
});

let lhsDecorator = vscode.window.createTextEditorDecorationType({
  overviewRulerColor: "blue",
  overviewRulerLane: vscode.OverviewRulerLane.Right,
  cursor: "pointer",
  color: "#FFD580",
  after: {
    fontWeight: "bold",
  },
  light: {
    color: "violet",
    borderColor: "lightgreen",
  },
  dark: {
    color: "violet",
    borderColor: "lightgreen",
  },
});

let rhsDecorator = vscode.window.createTextEditorDecorationType({
  overviewRulerColor: "blue",
  overviewRulerLane: vscode.OverviewRulerLane.Right,
  cursor: "pointer",
  color: "#FFD580",
  after: {
    fontWeight: "bold",
  },
  light: {
    color: "lightgreen",
    borderColor: "lightorange",
  },
  dark: {
    color: "lightgreen",
    borderColor: "lightorange",
  },
});

class TerragruntNav {
  patterns = [
    {
      pattern:
        /(source[ ]{0,}=[ ]{0,}")git::(ssh:\/\/|)(.*)\/\/([^#\r\n"?]+)\?([^#\r\n"]+)/,
      location: "git",
    },
    {
      pattern: /((source|config_path)[ ]{0,}=[ ]{0,}")([^#\r\n"]+)/,
      location: "local",
    },
    {
      pattern:
        /((find_in_parent_folders|file|read_terragrunt_config)\(")([^#\r\n"]+)/,
      location: "enclosed",
    },
  ];
  replaceStrings = true;
  replacementStrings = [];
  quickReplaceStringsCount = 1;
  getCodePath = "";

  constructor(context) {
    const repoCacheDir =
      process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME;
    this.terragruntRepoCache = path.join(
      repoCacheDir,
      ".terragrunt-repo-cache",
    );
    this.lastClonedMap = new Map();

    let config = vscode.workspace.getConfiguration("terragrunt-navigator");
    let featureToggles = getFeatureTogglesConfig();

    if (featureToggles["ReplaceStrings"] === undefined) {
      featureToggles["ReplaceStrings"] = true;
      vscode.workspace
        .getConfiguration("terragrunt-navigator")
        .update(
          "featureToggles",
          featureToggles,
          vscode.ConfigurationTarget.Global,
        );
    }
    this.replaceStrings = featureToggles["ReplaceStrings"];

    this.replacementStrings = config.get("replacementStrings");
    if (
      this.replacementStrings === undefined ||
      this.replacementStrings.length === 0
    ) {
      this.replacementStrings.push({ find: "", replace: "" });
    }

    this.quickReplaceStringsCount = vscode.workspace
      .getConfiguration("terragrunt-navigator")
      .get("quickReplaceStringsCount");
    if (
      this.quickReplaceStringsCount === undefined ||
      this.quickReplaceStringsCount < 1
    ) {
      this.quickReplaceStringsCount = 1;
      vscode.workspace
        .getConfiguration("terragrunt-navigator")
        .update(
          "quickReplaceStringsCount",
          this.quickReplaceStringsCount,
          vscode.ConfigurationTarget.Global,
        );
    }

    const extensionPath = context.extensionPath;
    this.getCodePath = path.join(extensionPath, "get-code.sh");

    let terragruntRepoCacheExists = false;
    for (let folder of vscode.workspace.workspaceFolders) {
      if (folder.uri.fsPath.endsWith("terragrunt-repo-cache")) {
        this.terragruntRepoCache = folder.uri.fsPath;
        terragruntRepoCacheExists = true;
        break;
      }
    }

    if (!terragruntRepoCacheExists) {
      if (!fs.existsSync(this.terragruntRepoCache)) {
        fs.mkdirSync(this.terragruntRepoCache);
        console.log("Created terragrunt repo cache directory");
      }

      vscode.workspace.updateWorkspaceFolders(0, 0, {
        uri: vscode.Uri.file(this.terragruntRepoCache),
      });
    }
  }

  provideDocumentLinks(document, token) {
    let links = [];
    let linkDecorations = [];
    let lhsDecorations = [];
    let rhsDecorations = [];

    console.log("Providing document links for " + document.uri.fsPath);
    if (!document) {
      return;
    }

    this.updateConfigs();
    try {
      this.decorateKeys(lhsDecorations, this.configs, this.ranges);
    } catch (e) {
      console.log("Failed to decorate keys: " + e);
    }

    try {
      this.decorateValues(document, rhsDecorations, linkDecorations, links);
    } catch (e) {
      console.log("Failed to decorate values: " + e);
    }

    if (vscode.window.activeTextEditor) {
      vscode.window.activeTextEditor.setDecorations(
        linkDecator,
        linkDecorations,
      );
      vscode.window.activeTextEditor.setDecorations(
        lhsDecorator,
        lhsDecorations,
      );
      vscode.window.activeTextEditor.setDecorations(
        rhsDecorator,
        rhsDecorations,
      );
      vscode.window.activeTextEditor.setDocumentLinks(links);
    }
    return links;
  }

  decorateKeys(decorations, configs = {}, ranges = {}) {
    for (let key in configs) {
      if (configs.hasOwnProperty(key) && ranges.hasOwnProperty(key)) {
        let value = configs[key];
        let range = ranges[key];
        if (range.hasOwnProperty("__range")) {
          let r = range.__range;
          let message = new vscode.MarkdownString(
            `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``,
          );
          message.isTrusted = true;
          decorations.push({
            range: new vscode.Range(r.sl, r.sc, r.el, r.ec),
            hoverMessage: message,
          });
        }
        if (typeof value === "object" && value !== null) {
          this.decorateKeys(decorations, value, range);
        }
      }
    }
  }

  decorateValues(document, rhsDecorations, linkDecorations, links) {
    for (let line = 0; line < document.lineCount; line++) {
      let textLine = document.lineAt(line);

      if (this.decorateLinks(linkDecorations, links, textLine, line)) {
        continue;
      }

      try {
        let pattern =
          /\${(local|var|dependency)\.[^}]+}|(local|var|dependency)\.[a-zA-Z_][a-zA-Z0-9_\.]*/g;
        let match = textLine.text.match(pattern);
        if (!match) {
          continue;
        }

        for (let ii = 0; ii < match.length; ii++) {
          let str = match[ii].trim();
          var value = Terragrunt.evalExpression(str, this.configs);
          if (value === undefined || value === null) {
            value = "undefined";
          }
          let range = new vscode.Range(
            line,
            textLine.text.indexOf(match[ii]),
            line,
            textLine.text.indexOf(match[ii]) + match[ii].length,
          );
          let message = new vscode.MarkdownString(
            `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``,
          );
          message.isTrusted = true;
          rhsDecorations.push({ range: range, hoverMessage: message });
        }
      } catch (e) {
        console.log("Failed for " + textLine.text + " " + e);
      }
    }
  }

  decorateLinks(linkDecorations, links, textLine, line) {
    let match = null;
    let location = null;

    for (let pattern of this.patterns) {
      match = textLine.text.match(pattern.pattern);
      location = pattern.location;
      if (match) {
        break;
      }
    }

    if (match) {
      let result = this.getPathInfo(match, line, location);
      if (result) {
        const link = new vscode.DocumentLink(
          result.range,
          vscode.Uri.parse(result.path),
        );
        links.push(link);
        let message = `[${result.path}](${result.path}): Ctrl+click to Open`;
        linkDecorations.push({ range: result.range, hoverMessage: message });
      }
      return true;
    }

    return false;
  }

  updateConfigs() {
    let tfInfo = {
      freshStart: true,
      startDir: null,
      configs: {},
      ranges: {},
      tfConfigCount: 0,
    };
    try {
      console.log(
        "Reading config for " +
          vscode.window.activeTextEditor.document.uri.fsPath,
      );
      if (
        path.basename(vscode.window.activeTextEditor.document.uri.fsPath) ===
        "main.tf"
      ) {
        let varFile =
          vscode.window.activeTextEditor.document.uri.fsPath.replace(
            "main.tf",
            "variables.tf",
          );
        if (fs.existsSync(varFile)) {
          console.log("Reading variables for main.tf " + varFile);
          this.configs = Terragrunt.read_terragrunt_config(varFile, tfInfo);
        }
      }
      tfInfo.freshStart = true;
      this.configs = Terragrunt.read_terragrunt_config(
        vscode.window.activeTextEditor.document.uri.fsPath,
        tfInfo,
      );
      this.ranges = tfInfo.ranges;
    } catch (e) {
      console.log("Failed to read terragrunt config: " + e);
    }
  }

  getPathInfo(match, line, location) {
    let srcPath = "";
    let range = null;
    srcPath = match[3].trim();
    if (location === "enclosed") {
      let func = match[2].trim();
      let funcArgs = match[3].trim();
      if (func === "find_in_parent_folders") {
        srcPath = Terragrunt.find_in_parent_folders(funcArgs);
        if (!srcPath) {
          return null;
        }
      }
    }

    range = new vscode.Range(
      line,
      match.index + match[1].length,
      line,
      match.index + match[0].trimEnd().length,
    );

    if (this.replaceStrings && typeof srcPath === "string") {
      for (let replacement of this.replacementStrings) {
        srcPath = srcPath.replace(replacement.find, replacement.replace);
      }
    }
    srcPath = Terragrunt.evalExpression(srcPath, this.configs);

    return { path: srcPath, range };
  }

  // Open the file or task documentation on ctrl+click or F12
  provideDefinition(document, position, token) {
    let line = document.lineAt(position.line);
    let location = null;
    let match = null;
    for (let pattern of this.patterns) {
      match = line.text.match(pattern.pattern);
      location = pattern.location;
      if (match) {
        break;
      }
    }

    if (!match) {
      return null;
    }

    this.updateConfigs();

    let result = this.getPathInfo(match, position.line, location);
    if (!result) {
      return null;
    }

    let uri = null;
    if (location === "git") {
      let repoUrl = match[3];
      let url = null;
      try {
        let tmpUrl = repoUrl;
        if (repoUrl.startsWith("git@")) {
          tmpUrl = repoUrl.replace(":", "/").replace("git@", "https://");
        }
        url = new URL(tmpUrl.trim());
      } catch (e) {
        console.error("Failed to parse URL: " + e);
        return null;
      }
      const urlPath = url.pathname.replace(/\.git$/, "");
      if (repoUrl.startsWith("git@")) {
        repoUrl = `git@${url.hostname}:${urlPath}`;
      }

      let ref = match[5].trim().split("=")[1];
      let modulePath = match[4].trim();

      let repoDir = path.join(this.terragruntRepoCache, urlPath);
      let clone = true;

      const now = Date.now();
      if (
        this.lastClonedMap.has(repoDir) &&
        now - this.lastClonedMap.get(repoDir) < 30000
      ) {
        clone = false;
      } else {
        this.lastClonedMap.set(repoDir, now);
      }

      if (clone) {
        try {
          vscode.window.showInformationMessage(
            `Cloning ${repoUrl} to ${repoDir}`,
          );
          let cmd = `${this.getCodePath} ${repoUrl} ${ref} ${repoDir}`;
          if (os.platform() === "win32") {
            cmd = `git-bash.exe ${cmd}`;
          } else {
            cmd = `bash ${cmd}`;
          }
          execSync(cmd, (error, stdout, stderr) => {
            if (error) {
              console.error(`exec error: ${error}`);
              vscode.window.showInformationMessage(
                `Error cloning repository: ${error}`,
              );
            }
            console.log(`Repo cloned. stdout: ${stdout}`);
          });
        } catch (error) {
          console.error(`exec error: ${error}`);
          vscode.window.showInformationMessage(
            "Error cloning repository:",
            error,
          );
        }
      }
      let dir = path.join(repoDir, modulePath);
      uri = vscode.Uri.file(dir);
    } else {
      uri = vscode.Uri.file(result.path);
    }

    if (uri && fs.lstatSync(uri.fsPath).isDirectory()) {
      let dir = uri.fsPath;
      const files = fs.readdirSync(dir);
      if (files.length === 0) {
        return null;
      }
      let fileToOpen = null;
      let validFilesList = ["terragrunt.hcl", "main.tf"];
      for (let file of validFilesList) {
        if (files.includes(file)) {
          fileToOpen = path.join(dir, file);
          break;
        }
      }
      if (!fileToOpen) {
        fileToOpen = path.join(dir, files[0]);
      }
      uri = vscode.Uri.file(fileToOpen);
      vscode.commands.executeCommand("revealInExplorer", uri);
    }

    return new vscode.Location(uri, new vscode.Position(0, 0));
  }
}

async function replacementStringsCommand(terragruntNav) {
  let updated = false;
  let replacementStrings = terragruntNav.replacementStrings;
  let maxIterations = Math.min(
    terragruntNav.quickReplaceStringsCount,
    replacementStrings.length,
  );

  for (let i = 0; i < maxIterations; i++) {
    let replacement = replacementStrings[i];

    let find = await vscode.window.showInputBox({
      prompt: "Enter the string to find for replacement",
      value: replacement.find,
    });
    let replace = await vscode.window.showInputBox({
      prompt: "Enter the replacement string",
      value: replacement.replace,
    });

    if (find !== undefined && replace !== undefined) {
      replacement.find = find;
      replacement.replace = replace;
      updated = true;
    }
  }

  if (updated) {
    let config = vscode.workspace.getConfiguration(
      "terragrunt-navigator",
      null,
    );
    await config.update(
      "replacementStrings",
      replacementStrings,
      vscode.ConfigurationTarget.Global,
    );
  }
}

function getFeatureTogglesConfig() {
  let config = vscode.workspace.getConfiguration("terragrunt-navigator");
  let featureToggles = config.get("featureToggles") || {
    ReplaceStrings: undefined,
  };
  return featureToggles;
}

async function featureTogglesCommand(terragruntNav) {
  let featureToggles = getFeatureTogglesConfig();
  let featureTogglesMap = Object.entries(featureToggles).map(
    ([featureName, isEnabled]) => ({
      label: `${isEnabled ? "✅" : "❌"} ${featureName}`,
      featureName,
      isEnabled,
    }),
  );

  const selected = await vscode.window.showQuickPick(featureTogglesMap, {
    placeHolder: "Select a feature to toggle",
  });

  if (selected) {
    featureToggles[selected.featureName] = !selected.isEnabled;
    let config = vscode.workspace.getConfiguration("terragrunt-navigator");
    await config.update(
      "featureToggles",
      featureToggles,
      vscode.ConfigurationTarget.Global,
    );
    vscode.window.showInformationMessage(
      `Feature "${selected.featureName}" is now ${featureToggles[selected.featureName] ? "enabled" : "disabled"}.`,
    );
  }
}

function activate(context) {
  console.log("Terragrunt Navigator is now active!");
  let terragruntNav = new TerragruntNav(context);

  let filePatterns = ["**/*.hcl", "**/*.tf"];
  for (let pattern of filePatterns) {
    context.subscriptions.push(
      vscode.languages.registerDocumentLinkProvider(
        { scheme: "file", pattern: pattern },
        terragruntNav,
      ),
    );
    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(
        { scheme: "file", pattern: pattern },
        terragruntNav,
      ),
    );
  }

  let commandFunctionMap = {
    replacementStringsCommand: replacementStringsCommand,
    featureTogglesCommand: featureTogglesCommand,
  };
  for (let command in commandFunctionMap) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `terragrunt-navigator.${command}`,
        commandFunctionMap[command].bind(null, terragruntNav),
      ),
    );
  }

  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("terragrunt-navigator.replaceStrings")) {
      if (vscode.window.activeTextEditor) {
        terragruntNav.provideDocumentLinks(
          vscode.window.activeTextEditor.document,
          null,
        );
      }
    }
    // Update the feature toggles when the settings are changed
    if (event.affectsConfiguration("terragrunt-navigator.featureToggles")) {
      let featureToggles = getFeatureTogglesConfig();
      terragruntNav.replaceStrings = featureToggles["ReplaceStrings"];
    }
  });
}

exports.activate = activate;

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
