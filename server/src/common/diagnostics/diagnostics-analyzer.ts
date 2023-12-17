import {
  ATNSimulator,
  BaseErrorListener,
  BufferedTokenStream,
  CharStream,
  ErrorNode,
  IntervalSet,
  Lexer,
  ParseTree,
  ParserRuleContext,
  RecognitionException,
  Recognizer,
  TerminalNode,
  Token,
} from "antlr4ng";
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { Flavor } from "../flavor.js";
import { ParserFactory } from "../parser/parser-factory.js";
import { SymbolTableFactory } from "../symbol/symbol-table-factory.js";
import { BaseSymbol, SymbolTable } from "antlr4-c3";
import { FlavorAwareParser } from "../parser/flavor-aware-parser.js";
import { tokenRange, treeRange } from "../utils/range-utils.js";
import { capitalize, caseInsensitiveEquals } from "../utils/string-utils.js";
import { ReferenceIdentificationHelper } from "../reference/reference-identification-helper.js";
import { ReferenceKind } from "../reference/reference-kind.js";
import { StateSymbol } from "../symbol/state-symbol.js";
import { RuleSymbol } from "../symbol/rule-symbol.js";
import { ActionSymbol } from "../symbol/action-symbol.js";
import { getSpellingSuggestion } from "../utils/suggestion-utils.js";
import { InvocableSymbol } from "../symbol/invocable-symbol.js";
import { DiagnosticsSettings } from "../settings.js";

const DIAGNOSTIC_SOURCE = "eo+";

export interface QuickFix {
  title: string;
  edits: TextEdit[];
  isPreferred: boolean;
}

export class DiagnosticsAnalyzer {
  private readonly flavor: Flavor;
  private readonly settings: DiagnosticsSettings;
  private parser: FlavorAwareParser;
  private symbolTable: SymbolTable;
  private referenceHelper: ReferenceIdentificationHelper;
  private mainExists: boolean;

  constructor(flavor: Flavor, settings: DiagnosticsSettings) {
    this.flavor = flavor;
    this.settings = settings;
  }

  analyze(code: CharStream): Diagnostic[] {
    const parserFactory = new ParserFactory(this.flavor);

    const diagnostics = new Array<Diagnostic>();
    const lexerErrorListener = new LexerErrorListener(diagnostics);
    const parserErrorListener = new ParserErrorListener(diagnostics);

    parserFactory.addLexerErrorListener(lexerErrorListener);
    parserFactory.addParserErrorListener(parserErrorListener);

    this.parser = parserFactory.create(code);
    const file = this.parser.file();

    this.symbolTable = new SymbolTableFactory(this.flavor).create(file);
    this.referenceHelper = new ReferenceIdentificationHelper(this.parser);

    this.collectDiagnostics(file, diagnostics);
    this.checkMainExists(diagnostics);

    return diagnostics;
  }

  private collectDiagnostics(tree: ParseTree, result: Diagnostic[]) {
    if (tree instanceof TerminalNode) {
      this.collectDiagnosticsFromTerminalNode(tree, result);
    } else if (tree instanceof ParserRuleContext) {
      this.collectDiagnosticsFromParserRuleContext(tree, result);
    }

    for (let i = 0; i < tree.getChildCount(); ++i) {
      this.collectDiagnostics(tree.getChild(i)!, result);
    }
  }

  private collectDiagnosticsFromTerminalNode(
    tree: TerminalNode,
    result: Diagnostic[],
  ) {
    if (tree instanceof ErrorNode) {
      // Already handled in the error listeners
      return;
    }

    this.collectDiagnosticsFromNameReferences(tree, result);
    this.collectDiagnosticsFromKeywords(tree, result);
  }

  private collectDiagnosticsFromNameReferences(
    tree: TerminalNode,
    result: Diagnostic[],
  ) {
    const referenceKind = this.referenceHelper.identify(tree);
    let symbols: Array<BaseSymbol>;

    switch (referenceKind) {
      case ReferenceKind.RULE:
        symbols = this.symbolTable.getNestedSymbolsOfTypeSync(RuleSymbol);
        break;

      case ReferenceKind.ACTION:
        symbols = this.symbolTable.getNestedSymbolsOfTypeSync(ActionSymbol);
        break;

      case ReferenceKind.STATE:
        symbols = this.symbolTable.getNestedSymbolsOfTypeSync(StateSymbol);
        break;

      default:
        return;
    }

    const name = tree.getText();
    const symbol = symbols.find((symbol) =>
      caseInsensitiveEquals(symbol.name, name),
    );

    if (symbol) {
      this.collectDiagnosticsFromResolvedNameReference(tree, symbol, result);
      return;
    }

    const range = treeRange(tree);
    const kindName = ReferenceKind[referenceKind].toLowerCase();
    let message = `Cannot find ${kindName} '${name}'.`;
    const data = new Array<QuickFix>();

    const suggestion = getSpellingSuggestion(
      name,
      symbols,
      (symbol) => symbol.name,
    );
    if (suggestion) {
      message += ` Did you mean '${suggestion.name}'?`;
      data.push({
        title: `Change spelling to '${suggestion.name}'`,
        edits: [TextEdit.replace(range, suggestion.name)],
        isPreferred: true,
      });
    }

    const stateBlock = this.getContextByName("stateBlock", tree);

    if (stateBlock) {
      const position = treeRange(stateBlock).end;
      data.push({
        title: `Add missing state '${name}'`,
        edits: [TextEdit.insert(position, `\n\nstate ${name}\n{\n\n}`)],
        isPreferred: data.length === 0,
      });
    }

    result.push({
      range,
      severity: DiagnosticSeverity.Error,
      source: DIAGNOSTIC_SOURCE,
      message,
      data,
    });
  }

  private collectDiagnosticsFromResolvedNameReference(
    tree: ParseTree,
    symbol: BaseSymbol,
    result: Diagnostic[],
  ) {
    if (symbol instanceof InvocableSymbol) {
      this.collectDiagnosticsFromInvocableReference(tree, symbol, result);
    }

    if (tree.getText() !== symbol.name) {
      const range = treeRange(tree);
      result.push({
        range,
        severity: DiagnosticSeverity.Warning,
        source: DIAGNOSTIC_SOURCE,
        message: `Name reference casing should match declaration ('${symbol.name}').`,
        data: {
          title: `Change casing to '${symbol.name}'`,
          edits: [TextEdit.replace(range, symbol.name)],
          isPreferred: true,
        },
      });
    }
  }

  private collectDiagnosticsFromInvocableReference(
    tree: ParseTree,
    symbol: InvocableSymbol,
    result: Diagnostic[],
  ) {
    if (symbol.name === "SetState") {
      result.push({
        range: treeRange(tree),
        severity: DiagnosticSeverity.Warning,
        source: DIAGNOSTIC_SOURCE,
        message: "'goto' expressions should be preferred over 'SetState'.",
      });
    }

    const parent = tree.parent!;

    const argumentList = parent.getChild(parent.getChildCount() - 1);
    if (this.getRuleName(argumentList) !== "argumentList") {
      return;
    }

    if (argumentList!.getChildCount() < 2) {
      return;
    }

    const argumentData = new Array<ArgumentData>();
    const arguments_ = argumentList!.getChild(1);

    if (this.getRuleName(arguments_) === "arguments") {
      for (let i = 0; i < arguments_!.getChildCount(); ++i) {
        const data = this.createArgumentData(arguments_!.getChild(i)!);
        if (data) {
          argumentData.push(data);
        }
      }
    }

    let parametersCount = symbol.parameters.length;
    let requiredParametersCount = 0;

    for (let parameter of symbol.parameters) {
      if (!parameter.optional) {
        ++requiredParametersCount;
      } else {
        break;
      }
    }

    const notEnoughArguments = argumentData.length < requiredParametersCount;
    const tooManyArguments = argumentData.length > parametersCount;

    if (notEnoughArguments || tooManyArguments) {
      let expectedArguments = requiredParametersCount.toString();
      if (parametersCount !== requiredParametersCount) {
        expectedArguments += `-${parametersCount}`;
      }

      expectedArguments += " argument";
      if (!(requiredParametersCount === 1 && parametersCount === 1)) {
        expectedArguments += "s";
      }

      let range: Range;

      if (notEnoughArguments) {
        const { start } = treeRange(tree);
        const { end } = treeRange(argumentList!);
        range = { start, end };
      } else {
        const { start } = treeRange(argumentData[parametersCount].tree);
        const { end } = treeRange(argumentData[argumentData.length - 1].tree);
        range = { start, end };
      }

      result.push({
        range,
        severity: DiagnosticSeverity.Error,
        source: DIAGNOSTIC_SOURCE,
        message: `Expected ${expectedArguments}, but got ${argumentData.length}.`,
      });

      return;
    }

    for (let i = 0; i < argumentData.length; ++i) {
      const { tree, type } = argumentData[i];
      const parameterType = symbol.parameters[i].type;
      if (type !== parameterType) {
        result.push({
          range: treeRange(tree),
          severity: DiagnosticSeverity.Error,
          source: DIAGNOSTIC_SOURCE,
          message:
            `Argument of type '${type}' is not assignable to parameter of ` +
            `type '${parameterType}'.`,
        });
      }
    }
  }

  private createArgumentData(tree: ParseTree): ArgumentData | null {
    if (tree.getText() === ",") {
      return null;
    }

    const expressionName =
      this.flavor === Flavor.OFFICIAL ? "expression" : "argumentExpression";

    if (this.getRuleName(tree) === expressionName) {
      const literal = tree.getChild(0)!;
      if (this.getRuleName(literal) === "literal") {
        const tokenName = this.getTokenName(literal.getChild(0));

        switch (tokenName) {
          case "IntegerLiteral":
            return { tree, type: "integer" };
          case "StringLiteral":
            return { tree, type: "string" };
        }
      }
    }

    return null;
  }

  private collectDiagnosticsFromKeywords(
    tree: TerminalNode,
    result: Diagnostic[],
  ) {
    if (!this.parser.isKeyword(tree.symbol.type)) {
      return;
    }

    const lowercase = tree.symbol.text!.toLowerCase();
    if (tree.symbol.text === lowercase) {
      return;
    }

    if (this.settings.alternateKeywordCasings.includes(tree.symbol.text!)) {
      return;
    }

    const range = treeRange(tree);

    result.push({
      range,
      severity: DiagnosticSeverity.Warning,
      source: DIAGNOSTIC_SOURCE,
      message: "Keywords should be lowercase.",
      data: {
        title: `Change casing to '${lowercase}'`,
        edits: [TextEdit.replace(range, lowercase)],
        isPreferred: true,
      },
    });
  }

  private collectDiagnosticsFromParserRuleContext(
    tree: ParserRuleContext,
    result: Diagnostic[],
  ) {
    switch (this.getRuleName(tree)) {
      case "mainBlock":
        this.collectDiagnosticsFromMainBlock(tree, result);
        break;

      case "stateBlock":
        this.collectDiagnosticsFromStateBlock(tree, result);
        break;

      case "gotoExpression":
        this.collectDiagnosticsFromGotoExpression(tree, result);
        break;
    }
  }

  private collectDiagnosticsFromMainBlock(
    tree: ParserRuleContext,
    result: Diagnostic[],
  ) {
    if (this.mainExists) {
      result.push({
        range: treeRange(tree.getChild(0)!),
        severity: DiagnosticSeverity.Error,
        source: DIAGNOSTIC_SOURCE,
        message: "Cannot redeclare 'main' block.",
        data: {
          title: "Remove duplicate 'main' block",
          edits: [TextEdit.del(treeRange(tree))],
          isPreferred: true,
        },
      });
    }

    this.mainExists = true;

    const attributes = new Set<string>();

    for (let i = 0; i < tree.getChildCount(); ++i) {
      const attribute = tree.getChild(i)!;
      if (this.getRuleName(attribute) !== "mainAttribute") {
        continue;
      }

      const attributeName = attribute
        .getChild(0)!
        .getChild(0)!
        .getText()
        .toLowerCase();

      if (attributes.has(attributeName)) {
        result.push({
          range: treeRange(attribute),
          severity: DiagnosticSeverity.Error,
          source: DIAGNOSTIC_SOURCE,
          message: `Cannot specify multiple '${attributeName}' attributes.`,
          data: {
            title: `Remove duplicate '${attributeName}' attribute`,
            edits: [TextEdit.del(treeRange(attribute))],
            isPreferred: true,
          },
        });
      }

      attributes.add(attributeName);
    }
  }

  private collectDiagnosticsFromStateBlock(
    tree: ParserRuleContext,
    result: Diagnostic[],
  ) {
    const identifier = tree.getChild(1);

    if (this.getTokenName(identifier) !== "Identifier") {
      return;
    }

    const name = identifier!.getText();
    const symbols = this.symbolTable
      .getNestedSymbolsOfTypeSync(StateSymbol)
      .filter((symbol) => caseInsensitiveEquals(symbol.name, name));

    if (symbols.length > 1 && symbols[0].context !== identifier) {
      result.push({
        range: treeRange(identifier!),
        severity: DiagnosticSeverity.Error,
        source: DIAGNOSTIC_SOURCE,
        message: `Cannot redeclare state '${name}'.`,
      });
    }

    let descExists = false;

    for (let i = 0; i < tree.getChildCount(); ++i) {
      const statement = tree.getChild(i)!;
      if (this.getRuleName(statement) !== "statement") {
        continue;
      }

      const desc = statement.getChild(0);
      if (this.getRuleName(desc) === "desc") {
        if (descExists) {
          result.push({
            range: treeRange(desc!),
            severity: DiagnosticSeverity.Error,
            source: DIAGNOSTIC_SOURCE,
            message: "Cannot specify multiple state descriptions.",
            data: {
              title: `Remove duplicate 'desc'`,
              edits: [TextEdit.del(treeRange(desc!))],
              isPreferred: true,
            },
          });
        }
        descExists = true;
      }
    }
  }

  private collectDiagnosticsFromGotoExpression(
    tree: ParserRuleContext,
    result: Diagnostic[],
  ) {
    const expression = tree.parent;
    if (this.getRuleName(expression) !== "expression") {
      return;
    }

    const parent = expression!.parent;
    switch (this.getRuleName(parent)) {
      case "rule":
      case "goal":
      case "if":
      case "elseif":
        if (parent!.getChild(1) === expression) {
          result.push({
            range: treeRange(tree),
            severity: DiagnosticSeverity.Error,
            source: DIAGNOSTIC_SOURCE,
            message: "'goto' expression is not allowed here.",
          });
        }
        break;
    }
  }

  private checkMainExists(result: Diagnostic[]) {
    if (this.mainExists) {
      return;
    }

    const token = this.findFirstMeaningfulToken();
    if (!token || "main".startsWith(token.text!.toLowerCase())) {
      return;
    }

    const range = tokenRange(token);

    let insertOffset = 0;
    while (true) {
      const index = token.start + insertOffset - 1;
      if (index < 0) {
        break;
      }

      const character = token.inputStream?.getText(index, index);
      if (character !== " " && character !== "\t") {
        break;
      }

      --insertOffset;
    }

    result.push({
      range,
      severity: DiagnosticSeverity.Error,
      source: DIAGNOSTIC_SOURCE,
      message: "'main' block is missing.",
      data: {
        title: "Add a 'main' block",
        edits: [
          TextEdit.insert(
            {
              character: range.start.character + insertOffset,
              line: range.start.line,
            },
            "main\n{\n\n}\n\n",
          ),
        ],
      },
    });
  }

  private getRuleName(tree: ParseTree | null): string | null {
    if (tree instanceof ParserRuleContext) {
      return this.parser.ruleNames[tree.ruleIndex] ?? null;
    }
    return null;
  }

  private getTokenName(tree: ParseTree | null): string | null {
    if (tree instanceof TerminalNode) {
      return this.parser.vocabulary.getSymbolicName(tree.symbol.type);
    }
    return null;
  }

  private getContextByName(
    name: string,
    tree: ParseTree,
  ): ParserRuleContext | null {
    let result: ParseTree | null = tree;
    while (result !== null) {
      if (this.getRuleName(result) === name) {
        return result as ParserRuleContext;
      }
      result = result.parent;
    }
    return null;
  }

  private findFirstMeaningfulToken(): Token | null {
    const meaningfulTokens = (this.parser.tokenStream as BufferedTokenStream)
      .getTokens()
      .filter((token) => token.channel === Lexer.DEFAULT_TOKEN_CHANNEL)
      .filter((token) => token.type !== Token.EOF);
    return meaningfulTokens[0] ?? null;
  }
}

class LexerErrorListener extends BaseErrorListener {
  private readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super();
    this.diagnostics = diagnostics;
  }

  syntaxError<S extends Token, T extends ATNSimulator>(
    recognizer: Recognizer<T>,
    _offendingSymbol: S | null,
    line: number,
    column: number,
    msg: string,
    e: RecognitionException | null,
  ): void {
    const lexer = recognizer as unknown as Lexer;
    const input = lexer.inputStream;

    const inputText = input.getText(lexer._tokenStartCharIndex, input.index);
    const text = lexer.getErrorDisplay(inputText);

    let message: string;

    if (text.startsWith('"')) {
      message = "Unterminated string literal.";
    } else {
      message = `Invalid input.`;
    }

    this.diagnostics.push({
      range: {
        start: { line: line - 1, character: column },
        end: { line: line - 1, character: column + text.length },
      },
      severity: DiagnosticSeverity.Error,
      source: DIAGNOSTIC_SOURCE,
      message,
    });
  }
}

class ParserErrorListener extends BaseErrorListener {
  private readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super();
    this.diagnostics = diagnostics;
  }

  syntaxError<S extends Token, T extends ATNSimulator>(
    recognizer: Recognizer<T>,
    offendingSymbol: S | null,
    _line: number,
    _column: number,
    msg: string,
    e: RecognitionException | null,
  ): void {
    const parser = recognizer as unknown as FlavorAwareParser;

    offendingSymbol = offendingSymbol!;

    const isEof = offendingSymbol.type === Token.EOF;
    if (isEof) {
      const previous = parser.tokenStream.LT(-1);
      if (previous) {
        offendingSymbol = previous as S;
      }
    }

    let wrongText = offendingSymbol.text;
    wrongText = wrongText?.startsWith("'")
      ? `"${wrongText}"`
      : `'${wrongText}'`;

    let message: string;

    const expected = parser.getExpectedTokens();
    let expectedText = this.intervalToString(expected, parser);

    if (expectedText.includes("'questname'")) {
      expectedText = "attribute name";
    } else if (expectedText.includes("'desc'")) {
      expectedText = "statement";
    } else if (
      expectedText.includes("'goto'") &&
      expectedText.includes("identifier")
    ) {
      expectedText = "expression";
    } else if (
      expectedText.toLowerCase().includes("string") &&
      expectedText.toLowerCase().includes("integer") &&
      this.getContextByName("argumentList", parser)
    ) {
      expectedText = "argument expression";
    }

    if (msg.includes("missing") || !expectedText.includes(",")) {
      message = `${capitalize(expectedText)} expected.`;
    } else {
      message = `Extraneous input ${wrongText} found (expecting ${expectedText}).`;
    }

    this.diagnostics.push({
      range: tokenRange(offendingSymbol),
      severity: DiagnosticSeverity.Error,
      source: DIAGNOSTIC_SOURCE,
      message,
    });
  }

  private getContextByName(
    name: string,
    parser: FlavorAwareParser,
  ): ParserRuleContext | null {
    let result = parser.context;
    while (result !== null) {
      if (parser.ruleNames[result.ruleIndex] === name) {
        break;
      }
      result = result.parent;
    }
    return result;
  }

  private intervalToString(
    set: IntervalSet,
    parser: FlavorAwareParser,
  ): string {
    return set
      .toArray()
      .filter((tokenType) => tokenType !== Token.EOF)
      .map((tokenType) => this.tokenTypeToDisplayName(tokenType, parser))
      .filter((displayName) => displayName !== null)
      .filter((displayName) => this.isSignificantToken(displayName!))
      .join(", ");
  }

  private tokenTypeToDisplayName(
    tokenType: number,
    parser: FlavorAwareParser,
  ): string | null {
    let result = parser.vocabulary.getDisplayName(tokenType);

    while (result?.endsWith("_")) {
      result = result.substring(0, result.length - 1);
    }

    switch (result) {
      case "IntegerLiteral":
        result = "integer";
        break;
      case "StringLiteral":
        result = "string";
        break;
      case "Identifier":
        result = "identifier";
        break;
      default:
        if (parser.isKeyword(tokenType)) {
          result = `'${result!.toLowerCase()}'`;
        }
        break;
    }

    return result;
  }

  private isSignificantToken(displayName: string): boolean {
    switch (displayName) {
      case "'character'":
      case "'npc'":
      case "'map'":
      case "'world'":
      case "';'":
        return false;
      default:
        return true;
    }
  }
}

interface ArgumentData {
  tree: ParseTree;
  type: string;
}
