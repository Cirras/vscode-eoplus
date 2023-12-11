import { CharStream, ParseTree, Token } from "antlr4ng";
import { CodeCompletionCore, SymbolTable } from "antlr4-c3";
import { CaretPosition, TokenPosition } from "../position/position.js";
import * as fuzzysort from "fuzzysort";
import { StateSymbol } from "../symbol/state-symbol.js";
import { computeTokenPosition } from "../position/compute-token-position.js";
import {
  CompletionItem,
  CompletionItemKind,
  MarkupKind,
} from "vscode-languageserver";
import { Flavor } from "../flavor.js";
import { ParserFactory } from "../parser/parser-factory.js";
import { FlavorAwareParser } from "../parser/flavor-aware-parser.js";
import { SymbolTableFactory } from "../symbol/symbol-table-factory.js";
import { ActionSymbol } from "../symbol/action-symbol.js";
import { RuleSymbol } from "../symbol/rule-symbol.js";
import { Parameter } from "../symbol/parameter.js";
import { ReferenceIdentificationHelper } from "../reference/reference-identification-helper.js";
import { ReferenceKind } from "../reference/reference-kind.js";

export class CompletionItemGenerator {
  private readonly flavor: Flavor;
  private file: ParseTree;

  public constructor(flavor: Flavor) {
    this.flavor = flavor;
  }

  public async generate(
    code: CharStream,
    caretPosition: CaretPosition,
  ): Promise<CompletionItem[]> {
    const parserFactory = new ParserFactory(this.flavor);
    const parser = parserFactory.create(code);
    this.file = parser.file();

    let position = computeTokenPosition(
      this.file,
      parser.tokenStream,
      caretPosition,
    );

    if (!position) {
      return [];
    }

    return this.getCompletionsForPosition(parser, position);
  }

  private async getCompletionsForPosition(
    parser: FlavorAwareParser,
    position: TokenPosition,
  ): Promise<CompletionItem[]> {
    const core = this.createCodeCompletionCore(parser);
    let candidates = core.collectCandidates(position.index);

    let tokens = new Array<string>();
    candidates.tokens.forEach((_, k) => {
      const symbolicName = parser.vocabulary.getSymbolicName(k);
      if (symbolicName) {
        tokens.push(this.processSymbolicName(symbolicName));
      }
    });

    let completions = this.filterCompletions(
      position.text,
      tokens.map((s: string) => ({
        label: s,
        kind: CompletionItemKind.Keyword,
      })),
    );

    if (completions.length === 0) {
      completions.push(
        ...(await this.getCompletionsForParseTree(parser, position.context)),
      );
    }

    return this.filterCompletions(position.text, completions);
  }

  private processSymbolicName(name: string): string {
    name = name.toLowerCase();
    while (name.endsWith("_")) {
      name = name.substring(0, name.length - 1);
    }
    return name;
  }

  private createCodeCompletionCore(
    parser: FlavorAwareParser,
  ): CodeCompletionCore {
    let afterKeywords = false;
    const ignored = new Set<number>();

    for (let i = 1; i <= parser.vocabulary.maxTokenType; ++i) {
      if (afterKeywords) {
        ignored.add(i);
      }
      afterKeywords = afterKeywords || !parser.isKeyword(i);
    }

    for (let notImplementedKeyword in ["CHARACTER", "NPC", "MAP", "WORLD"]) {
      let tokenType = parser.getTokenType(notImplementedKeyword);
      if (tokenType !== Token.INVALID_TYPE) {
        ignored.add(tokenType);
      }
    }

    ignored.add(Token.EOF);

    let core = new CodeCompletionCore(parser);
    core.ignoredTokens = ignored;

    return core;
  }

  private async getCompletionsForParseTree(
    parser: FlavorAwareParser,
    tree: ParseTree,
  ): Promise<CompletionItem[]> {
    const helper = new ReferenceIdentificationHelper(parser);
    switch (helper.identify(tree)) {
      case ReferenceKind.RULE:
        return this.getRuleReferences();
      case ReferenceKind.ACTION:
        return this.getActionReferences();
      case ReferenceKind.STATE:
        return this.getStateReferences();
      default:
        return [];
    }
  }

  private async getRuleReferences(): Promise<CompletionItem[]> {
    const symbolTable = this.generateSymbolTable();
    return (await symbolTable.getSymbolsOfType(RuleSymbol)).map((rule) => ({
      label: rule.name,
      kind: CompletionItemKind.Function,
      documentation: { kind: MarkupKind.Markdown, value: rule.documentation },
      detail: `(rule) ${rule.name}${this.parameterDetails(rule.parameters)}`,
    }));
  }

  private async getActionReferences(): Promise<CompletionItem[]> {
    const symbolTable = this.generateSymbolTable();
    return (await symbolTable.getSymbolsOfType(ActionSymbol)).map((action) => ({
      label: action.name,
      kind: CompletionItemKind.Function,
      documentation: { kind: MarkupKind.Markdown, value: action.documentation },
      detail: `(action) ${action.name}${this.parameterDetails(
        action.parameters,
      )}`,
    }));
  }

  private async getStateReferences(): Promise<CompletionItem[]> {
    const symbolTable = this.generateSymbolTable();
    return (await symbolTable.getSymbolsOfType(StateSymbol)).map((state) => {
      const documentation = state.desc
        ? {
            kind: MarkupKind.Markdown,
            value: "```eoplus\n" + state.desc + "\n```",
          }
        : undefined;
      return {
        label: state.name,
        documentation: documentation,
        kind: CompletionItemKind.Module,
        detail: `(state) ${state.name}`,
      };
    });
  }

  private generateSymbolTable(): SymbolTable {
    const symbolTableFactory = new SymbolTableFactory(this.flavor);
    return symbolTableFactory.create(this.file);
  }

  private parameterDetails(parameters: ReadonlyArray<Parameter>): string {
    return "(" + parameters.map((p) => p.signature).join(", ") + ")";
  }

  private filterCompletions(text: string, completionItems: CompletionItem[]) {
    return fuzzysort
      .go<CompletionItem>(text, completionItems, { key: "label" })
      .map((r) => r.obj);
  }
}
