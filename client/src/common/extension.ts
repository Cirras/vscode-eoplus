import * as vscode from "vscode";

import {
  BaseLanguageClient,
  LanguageClientOptions,
  State,
} from "vscode-languageclient";
import { FlavorService } from "./flavor-service.js";

let client: BaseLanguageClient;

export function activateExtension(
  context: vscode.ExtensionContext,
  clientFactory: (
    id: string,
    name: string,
    clientOptions: LanguageClientOptions,
  ) => BaseLanguageClient,
) {
  FlavorService.init(context);

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "eoplus" },
      { scheme: "untitled", language: "eoplus" },
    ],
  };

  client = clientFactory("eoplus", "EO+", clientOptions);

  client.onDidChangeState((e) => {
    switch (e.newState) {
      case State.Starting:
        console.log("EO+ server is starting.");
        break;
      case State.Running:
        console.log("EO+ server is running.");
        break;
      case State.Stopped:
        console.log("EO+ server is stopped.");
        break;
    }
  });

  client.start();

  vscode.workspace.onDidOpenTextDocument((e) => {
    FlavorService.instance.updateFlavorStatusBarItem(e);
  });

  vscode.window.onDidChangeActiveTextEditor((e) => {
    FlavorService.instance.updateFlavorStatusBarItem(e.document);
  });

  vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (event.affectsConfiguration("eoplus.language.flavor")) {
      FlavorService.instance.updateFlavorState();
    }
  });
}

export function deactivateExtension(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
