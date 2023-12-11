import * as path from "path";
import * as vscode from "vscode";

import {
  LanguageClient,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";
import { activateExtension, deactivateExtension } from "../common/extension.js";

export function activate(context: vscode.ExtensionContext) {
  const serverModule = context.asAbsolutePath(
    path.join("dist", "server-node.js"),
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  activateExtension(
    context,
    (id, name, clientOptions) =>
      new LanguageClient(id, name, serverOptions, clientOptions),
  );
}

export function deactivate(): Thenable<void> | undefined {
  return deactivateExtension();
}
