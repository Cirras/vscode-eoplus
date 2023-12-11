import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/browser.js";
import { activateExtension, deactivateExtension } from "../common/extension.js";

// this method is called when vs code is activated
export function activate(context: vscode.ExtensionContext) {
  const serverMain = vscode.Uri.joinPath(
    context.extensionUri,
    "dist/server-web.js",
  );
  const worker = new Worker(serverMain.toString(true));

  activateExtension(
    context,
    (id, name, clientOptions) =>
      new LanguageClient(id, name, clientOptions, worker),
  );
}

export function deactivate(): Thenable<void> | undefined {
  return deactivateExtension();
}
