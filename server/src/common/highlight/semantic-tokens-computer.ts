import {
  CharStream,
  ParseTree,
  ParserRuleContext,
  TerminalNode,
  Token,
} from "antlr4ng";
import {
  SemanticTokenModifiers,
  SemanticTokenTypes,
  SemanticTokens,
  SemanticTokensBuilder,
} from "vscode-languageserver";
import { Flavor } from "../flavor.js";
import { ParserFactory } from "../parser/parser-factory.js";
import { FlavorAwareParser } from "../parser/flavor-aware-parser.js";
import { ReferenceIdentificationHelper } from "../reference/reference-identification-helper.js";
import { ReferenceKind } from "../reference/reference-kind.js";

export class SemanticTokensComputer {
  public static TOKEN_TYPES_LEGEND = [
    SemanticTokenTypes.type,
    SemanticTokenTypes.method,
  ];

  public static TOKEN_MODIFIERS_LEGEND = [SemanticTokenModifiers.declaration];

  private static TOKEN_TYPES = new Map<string, number>();
  private static TOKEN_MODIFIERS = new Map<string, number>();

  static {
    this.TOKEN_TYPES_LEGEND.forEach((type, index) =>
      this.TOKEN_TYPES.set(type, index),
    );
    this.TOKEN_MODIFIERS_LEGEND.forEach((modifier, index) =>
      this.TOKEN_MODIFIERS.set(modifier, index),
    );
  }

  private readonly flavor: Flavor;
  private builder: SemanticTokensBuilder;
  private parser: FlavorAwareParser;
  private referenceHelper: ReferenceIdentificationHelper;

  constructor(flavor: Flavor) {
    this.flavor = flavor;
  }

  compute(code: CharStream): SemanticTokens {
    this.builder = new SemanticTokensBuilder();
    this.parser = new ParserFactory(this.flavor).create(code);
    this.referenceHelper = new ReferenceIdentificationHelper(this.parser);

    this.indexTokens(this.parser.file());

    return this.builder.build();
  }

  private indexTokens(tree: ParseTree): void {
    if (tree instanceof TerminalNode) {
      this.indexTokenFromTerminalNode(tree);
    }

    for (let i = 0; i < tree.getChildCount(); ++i) {
      this.indexTokens(tree.getChild(i)!);
    }
  }

  private indexTokenFromTerminalNode(tree: TerminalNode): void {
    const symbol = tree.symbol;

    if (this.isIdentifier(tree)) {
      if (this.isStateNameDeclaration(tree)) {
        this.addSymbol(
          symbol,
          SemanticTokenTypes.type,
          SemanticTokenModifiers.declaration,
        );
        return;
      }

      const referenceKind = this.referenceHelper.identify(tree);

      switch (referenceKind) {
        case ReferenceKind.ACTION:
        case ReferenceKind.RULE:
          this.addSymbol(symbol, SemanticTokenTypes.method);
          break;
        case ReferenceKind.STATE:
          this.addSymbol(symbol, SemanticTokenTypes.type);
          break;
      }
    }
  }

  private isStateNameDeclaration(tree: TerminalNode): boolean {
    return (
      tree.parent instanceof ParserRuleContext &&
      this.parser.ruleNames[tree.parent.ruleIndex] === "stateBlock"
    );
  }

  private isIdentifier(tree: TerminalNode): boolean {
    return (
      this.parser.vocabulary.getSymbolicName(tree.symbol.type) === "Identifier"
    );
  }

  private addSymbol(
    symbol: Token,
    tokenType: SemanticTokenTypes,
    ...modifiers: Array<SemanticTokenModifiers>
  ) {
    this.builder.push(
      symbol.line - 1,
      symbol.column,
      symbol.text!.length,
      SemanticTokensComputer.TOKEN_TYPES.get(tokenType)!,
      this.encodeModifiers(modifiers),
    );
  }

  private encodeModifiers(modifiers: Array<SemanticTokenModifiers>): number {
    let result = 0;
    for (let modifier of modifiers) {
      result |= 1 << SemanticTokensComputer.TOKEN_MODIFIERS.get(modifier)!;
    }
    return result;
  }
}
