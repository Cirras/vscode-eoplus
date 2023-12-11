import {
  CharStream,
  ParseTree,
  ParserRuleContext,
  TerminalNode,
} from "antlr4ng";
import { Flavor } from "../flavor.js";
import { computeTokenPosition } from "../position/compute-token-position.js";
import {
  DefinitionLink,
  Location,
  LocationLink,
  Range,
} from "vscode-languageserver";
import { CaretPosition } from "../position/position.js";
import { ParserFactory } from "../parser/parser-factory.js";
import { ReferenceIdentificationHelper } from "../reference/reference-identification-helper.js";
import { ReferenceKind } from "../reference/reference-kind.js";
import { SymbolTableFactory } from "../symbol/symbol-table-factory.js";
import { caseInsensitiveEquals } from "../utils/string-utils.js";
import { FlavorAwareParser } from "../parser/flavor-aware-parser.js";
import { StateSymbol } from "../symbol/state-symbol.js";
import { treeRange } from "../utils/range-utils.js";

export class CodeNavigationHelper {
  private readonly flavor: Flavor;
  private parser: FlavorAwareParser;

  public constructor(flavor: Flavor) {
    this.flavor = flavor;
  }

  public findDefinition(
    uri: string,
    code: CharStream,
    caretPosition: CaretPosition,
  ): DefinitionLink[] | null {
    const parserFactory = new ParserFactory(this.flavor);
    this.parser = parserFactory.create(code);

    const file = this.parser.file();

    const position = computeTokenPosition(
      file,
      this.parser.tokenStream,
      caretPosition,
    );

    if (!position) {
      return null;
    }

    let tree = position.context;

    if (this.isStateNameDeclaration(tree)) {
      return this.createStateDefinitionLink(uri, tree);
    }

    const helper = new ReferenceIdentificationHelper(this.parser);
    if (helper.identify(tree) === ReferenceKind.STATE) {
      const name = tree.getText();

      const symbolTable = new SymbolTableFactory(this.flavor).create(file);
      const symbols = symbolTable.getAllSymbolsSync(StateSymbol, true);
      const symbol = symbols.find((s) => caseInsensitiveEquals(s.name, name));

      if (symbol) {
        return this.createStateDefinitionLink(uri, symbol.context!);
      }
    }

    return null;
  }

  public findReferences(
    uri: string,
    code: CharStream,
    caretPosition: CaretPosition,
    includeDeclaration: boolean,
  ): Location[] | null {
    const parserFactory = new ParserFactory(this.flavor);
    this.parser = parserFactory.create(code);

    const file = this.parser.file();

    const position = computeTokenPosition(
      file,
      this.parser.tokenStream,
      caretPosition,
    );

    if (!position) {
      return null;
    }

    let tree = position.context;
    let stateIdentifier: ParseTree | null = null;

    if (this.isStateNameDeclaration(tree)) {
      stateIdentifier = tree;
    }

    const helper = new ReferenceIdentificationHelper(this.parser);
    if (helper.identify(tree) === ReferenceKind.STATE) {
      const name = tree.getText();

      const symbolTable = new SymbolTableFactory(this.flavor).create(file);
      const symbols = symbolTable.getAllSymbolsSync(StateSymbol, true);
      const symbol = symbols.find((s) => caseInsensitiveEquals(s.name, name));

      if (symbol) {
        stateIdentifier = symbol.context!;
      }
    }

    if (stateIdentifier) {
      const result = this.indexReferences(stateIdentifier.getText(), file);
      if (includeDeclaration) {
        result.push(treeRange(stateIdentifier));
      }
      return result.map((range) => Location.create(uri, range)) || null;
    }

    return null;
  }

  private isIdentifier(tree: TerminalNode): boolean {
    return (
      this.parser.vocabulary.getSymbolicName(tree.symbol.type) === "Identifier"
    );
  }

  private createStateDefinitionLink(
    uri: string,
    tree: ParseTree,
  ): DefinitionLink[] {
    const definitionRange = definitionTreeRange(tree.parent!);
    const identifierRange = treeRange(tree);
    return [LocationLink.create(uri, definitionRange, identifierRange)];
  }

  private isStateNameDeclaration(tree: ParseTree): boolean {
    const vocabulary = this.parser.vocabulary;
    return (
      tree instanceof TerminalNode &&
      vocabulary.getSymbolicName(tree.symbol.type) === "Identifier" &&
      tree.parent instanceof ParserRuleContext &&
      this.parser.ruleNames[tree.parent.ruleIndex] === "stateBlock"
    );
  }

  private indexReferences(
    name: string,
    tree: ParseTree,
    result: Range[] = [],
  ): Range[] {
    if (tree instanceof TerminalNode) {
      this.indexReferencesFromTerminalNode(name, tree, result);
    }

    for (let i = 0; i < tree.getChildCount(); ++i) {
      this.indexReferences(name, tree.getChild(i)!, result);
    }

    return result;
  }

  private indexReferencesFromTerminalNode(
    name: string,
    tree: TerminalNode,
    result: Range[],
  ): void {
    if (!this.isIdentifier(tree)) {
      return;
    }

    if (!caseInsensitiveEquals(name, tree.getText())) {
      return;
    }

    const helper = new ReferenceIdentificationHelper(this.parser);
    if (helper.identify(tree) !== ReferenceKind.STATE) {
      return;
    }

    result.push(treeRange(tree));
  }
}

function definitionTreeRange(tree: ParseTree): Range {
  const result = treeRange(tree);
  if (result.end.line - result.start.line > 7) {
    result.end.line = result.start.line + 7;
    result.end.character = 255;
  }
  return result;
}
