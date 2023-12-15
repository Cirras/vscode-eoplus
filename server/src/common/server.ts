import {
  TextDocuments,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionParams,
  SignatureHelpParams,
  SignatureHelp,
  SemanticTokensRequest,
  DefinitionParams,
  DefinitionLink,
  ReferenceParams,
  Location,
  HoverParams,
  Hover,
  DocumentSymbolParams,
  DocumentSymbol,
  RenameParams,
  WorkspaceEdit,
  ResponseError,
  PrepareRenameParams,
  Range,
  Connection,
  CodeActionParams,
  CodeAction,
  CodeActionKind,
  Diagnostic,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CharStreams } from "antlr4ng";
import { Flavor } from "./flavor.js";
import { CompletionItemGenerator } from "./completion/completion-item-generator.js";
import { SignatureHelpGenerator } from "./signature/signature-help-generator.js";
import { SemanticTokensComputer } from "./highlight/semantic-tokens-computer.js";
import { CodeNavigationHelper } from "./navigation/code-navigation-helper.js";
import { HoverGenerator } from "./hover/hover-generator.js";
import { DocumentSymbolGenerator } from "./document-symbol/document-symbol-generator.js";
import {
  DiagnosticsAnalyzer,
  QuickFix,
} from "./diagnostics/diagnostics-analyzer.js";
import { RenameHelper } from "./rename/rename-helper.js";

export function createServer(connection: Connection) {
  let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

  let hasConfigurationCapability = false;
  let hasWorkspaceFolderCapability = false;

  connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities;

    hasConfigurationCapability = !!capabilities.workspace?.configuration;
    hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders;

    const result: InitializeResult = {
      capabilities: {
        completionProvider: {
          resolveProvider: true,
        },
        definitionProvider: true,
        referencesProvider: true,
        semanticTokensProvider: {
          legend: {
            tokenTypes: SemanticTokensComputer.TOKEN_TYPES_LEGEND,
            tokenModifiers: SemanticTokensComputer.TOKEN_MODIFIERS_LEGEND,
          },
          range: false,
          full: true,
        },
        signatureHelpProvider: {
          triggerCharacters: ["("],
          retriggerCharacters: [","],
        },
        hoverProvider: true,
        documentSymbolProvider: true,
        renameProvider: {
          prepareProvider: true,
        },
        codeActionProvider: true,
        textDocumentSync: TextDocumentSyncKind.Incremental,
      },
    };

    if (hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true,
        },
      };
    }

    return result;
  });

  connection.onInitialized(() => {
    if (hasConfigurationCapability) {
      connection.client.register(
        DidChangeConfigurationNotification.type,
        undefined,
      );
    }
  });

  interface EOPlusSettings {
    trace: {
      server: "off" | "messages" | "verbose";
    };
    language: {
      flavor: Flavor;
    };
  }

  const defaultSettings: EOPlusSettings = {
    trace: { server: "off" },
    language: { flavor: Flavor.EOSERV },
  };

  let globalSettings: EOPlusSettings = defaultSettings;

  const documentSettings: Map<string, Thenable<EOPlusSettings>> = new Map();

  connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
      documentSettings.clear();
    } else {
      globalSettings = <EOPlusSettings>(
        (change.settings.eoplus || defaultSettings)
      );
    }
    for (let document of documents.all()) {
      validateTextDocument(document);
    }
  });

  function getDocumentSettings(resource: string): Thenable<EOPlusSettings> {
    if (!hasConfigurationCapability) {
      return Promise.resolve(globalSettings);
    }

    let result = documentSettings.get(resource);
    if (!result) {
      result = connection.workspace.getConfiguration({
        scopeUri: resource,
        section: "eoplus",
      });
      documentSettings.set(resource, result);
    }

    return result;
  }

  documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
  });

  documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
  });

  async function validateTextDocument(document: TextDocument): Promise<void> {
    const settings = await getDocumentSettings(document.uri);
    const analyzer = new DiagnosticsAnalyzer(settings.language.flavor);

    const diagnostics = analyzer.analyze(
      CharStreams.fromString(document.getText()),
    );

    connection.sendDiagnostics({ uri: document.uri, diagnostics });
  }

  connection.onCompletion(
    async (params: CompletionParams): Promise<CompletionItem[]> => {
      let uri = params.textDocument.uri;

      let document = documents.get(uri);
      if (!document) {
        return [];
      }

      const settings = await getDocumentSettings(document.uri);
      const generator = new CompletionItemGenerator(settings.language.flavor);

      let caretPosition = {
        line: params.position.line + 1,
        column: params.position.character,
      };

      return generator.generate(
        CharStreams.fromString(document.getText()),
        caretPosition,
      );
    },
  );

  connection.onDefinition(
    async (params: DefinitionParams): Promise<DefinitionLink[] | null> => {
      let uri = params.textDocument.uri;

      let document = documents.get(uri);
      if (!document) {
        return null;
      }

      const settings = await getDocumentSettings(document.uri);
      const helper = new CodeNavigationHelper(settings.language.flavor);

      let caretPosition = {
        line: params.position.line + 1,
        column: params.position.character,
      };

      return helper.findDefinition(
        uri,
        CharStreams.fromString(document.getText()),
        caretPosition,
      );
    },
  );

  connection.onReferences(
    async (params: ReferenceParams): Promise<Location[] | null> => {
      let uri = params.textDocument.uri;

      let document = documents.get(uri);
      if (!document) {
        return null;
      }

      const settings = await getDocumentSettings(document.uri);
      const helper = new CodeNavigationHelper(settings.language.flavor);

      let caretPosition = {
        line: params.position.line + 1,
        column: params.position.character,
      };

      return helper.findReferences(
        uri,
        CharStreams.fromString(document.getText()),
        caretPosition,
        params.context.includeDeclaration,
      );
    },
  );

  connection.onSignatureHelp(
    async (params: SignatureHelpParams): Promise<SignatureHelp | null> => {
      let uri = params.textDocument.uri;

      let document = documents.get(uri);
      if (!document) {
        return null;
      }

      const settings = await getDocumentSettings(document.uri);
      const generator = new SignatureHelpGenerator(settings.language.flavor);

      let caretPosition = {
        line: params.position.line + 1,
        column: params.position.character,
      };

      return generator.generate(
        CharStreams.fromString(document.getText()),
        caretPosition,
      );
    },
  );

  connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    return item;
  });

  connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
    let uri = params.textDocument.uri;

    let document = documents.get(uri);
    if (!document) {
      return null;
    }

    const settings = await getDocumentSettings(document.uri);
    const generator = new HoverGenerator(settings.language.flavor);

    let caretPosition = {
      line: params.position.line + 1,
      column: params.position.character,
    };

    return generator.generate(
      CharStreams.fromString(document.getText()),
      caretPosition,
    );
  });

  connection.onDocumentSymbol(
    async (params: DocumentSymbolParams): Promise<DocumentSymbol[]> => {
      let uri = params.textDocument.uri;

      let document = documents.get(uri);
      if (!document) {
        return [];
      }

      const settings = await getDocumentSettings(document.uri);
      const generator = new DocumentSymbolGenerator(settings.language.flavor);

      return generator.generate(CharStreams.fromString(document.getText()));
    },
  );

  connection.onPrepareRename(
    async (
      params: PrepareRenameParams,
    ): Promise<Range | ResponseError | null> => {
      let uri = params.textDocument.uri;

      let document = documents.get(uri);
      if (!document) {
        return null;
      }

      const settings = await getDocumentSettings(document.uri);
      const helper = new RenameHelper(settings.language.flavor);

      let caretPosition = {
        line: params.position.line + 1,
        column: params.position.character,
      };

      return helper.prepare(
        CharStreams.fromString(document.getText()),
        caretPosition,
      );
    },
  );

  connection.onRenameRequest(
    async (params: RenameParams): Promise<WorkspaceEdit | null> => {
      let uri = params.textDocument.uri;

      let document = documents.get(uri);
      if (!document) {
        return null;
      }

      const settings = await getDocumentSettings(document.uri);
      const helper = new RenameHelper(settings.language.flavor);

      let caretPosition = {
        line: params.position.line + 1,
        column: params.position.character,
      };

      const edits = helper.rename(
        CharStreams.fromString(document.getText()),
        caretPosition,
        params.newName,
      );

      if (edits) {
        return { changes: { [uri]: edits } };
      }

      return null;
    },
  );

  connection.onCodeAction(
    async (params: CodeActionParams): Promise<CodeAction[]> => {
      const uri = params.textDocument.uri;
      return params.context.diagnostics
        .filter((diagnostic) => diagnostic.data)
        .flatMap((diagnostic) => dataToCodeAction(uri, diagnostic));
    },
  );

  function dataToCodeAction(
    uri: string,
    diagnostic: Diagnostic,
  ): CodeAction | CodeAction[] {
    const data = diagnostic.data;

    if (data instanceof Array) {
      return data.map((quickFix) =>
        quickFixToCodeAction(uri, diagnostic, quickFix),
      );
    }

    return quickFixToCodeAction(uri, diagnostic, data);
  }

  function quickFixToCodeAction(
    uri: string,
    diagnostic: Diagnostic,
    quickFix: QuickFix,
  ): CodeAction {
    return {
      title: quickFix.title,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: {
          [uri]: quickFix.edits,
        },
      },
      isPreferred: quickFix.isPreferred,
    };
  }

  connection.onRequest(SemanticTokensRequest.type, async (params) => {
    let uri = params.textDocument.uri;

    let document = documents.get(uri);
    if (!document) {
      return null;
    }

    const settings = await getDocumentSettings(document.uri);
    const computer = new SemanticTokensComputer(settings.language.flavor);
    const code = CharStreams.fromString(document.getText());

    return computer.compute(code);
  });

  documents.listen(connection);
  connection.listen();
}
