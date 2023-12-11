import {
  CharStream,
  ParseTree,
  ParserRuleContext,
  TerminalNode,
} from "antlr4ng";
import { Range, ResponseError, TextEdit } from "vscode-languageserver";
import { Flavor } from "../flavor.js";
import { computeTokenPosition } from "../position/compute-token-position.js";
import { CaretPosition } from "../position/position.js";
import { ParserFactory } from "../parser/parser-factory.js";
import { ReferenceIdentificationHelper } from "../reference/reference-identification-helper.js";
import { ReferenceKind } from "../reference/reference-kind.js";
import { caseInsensitiveEquals } from "../utils/string-utils.js";
import { FlavorAwareParser } from "../parser/flavor-aware-parser.js";
import { treeRange } from "../utils/range-utils.js";

export class RenameHelper {
  private static CANNOT_RENAME_ELEMENT = new ResponseError(
    1001,
    "You cannot rename this element.",
  );

  private static CANNOT_RENAME_RULE = new ResponseError(
    1002,
    "You cannot rename rules.",
  );

  private static CANNOT_RENAME_ACTION = new ResponseError(
    1003,
    "You cannot rename actions.",
  );

  private readonly flavor: Flavor;
  private parser: FlavorAwareParser;

  public constructor(flavor: Flavor) {
    this.flavor = flavor;
  }

  public prepare(
    code: CharStream,
    caretPosition: CaretPosition,
  ): Range | ResponseError {
    const parserFactory = new ParserFactory(this.flavor);
    this.parser = parserFactory.create(code);

    const file = this.parser.file();

    const position = computeTokenPosition(
      file,
      this.parser.tokenStream,
      caretPosition,
    );

    if (!position) {
      return RenameHelper.CANNOT_RENAME_ELEMENT;
    }

    const tree = position.context;

    const stateDeclaration = this.findStateNameDeclaration(tree);
    if (stateDeclaration) {
      return treeRange(stateDeclaration);
    }

    const helper = new ReferenceIdentificationHelper(this.parser);
    const referenceKind = helper.identify(tree);

    switch (referenceKind) {
      case ReferenceKind.RULE:
        return RenameHelper.CANNOT_RENAME_RULE;
      case ReferenceKind.ACTION:
        return RenameHelper.CANNOT_RENAME_ACTION;
      case ReferenceKind.STATE:
        return treeRange(tree);
      default:
        return RenameHelper.CANNOT_RENAME_ELEMENT;
    }
  }

  public rename(
    code: CharStream,
    caretPosition: CaretPosition,
    newName: string,
  ): TextEdit[] | null {
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
    tree = this.findStateNameDeclaration(tree) ?? tree;

    const helper = new ReferenceIdentificationHelper(this.parser);
    const kind = helper.identify(tree);
    const edits = new Array<TextEdit>();

    if (kind === ReferenceKind.STATE || this.isStateNameDeclaration(tree)) {
      this.collectEdits(tree.getText(), newName, file, edits);
    } else {
      return null;
    }

    return edits;
  }

  private isIdentifier(tree: TerminalNode): boolean {
    return (
      this.parser.vocabulary.getSymbolicName(tree.symbol.type) === "Identifier"
    );
  }

  private findStateNameDeclaration(tree: ParseTree): ParseTree | null {
    if (this.isStateNameDeclaration(tree)) {
      return tree;
    }

    if (
      tree instanceof TerminalNode &&
      tree.getText().toLowerCase() === "state" &&
      tree.parent?.getChild(0) === tree
    ) {
      const identifier = tree.parent.getChild(1);
      if (this.isStateNameDeclaration(identifier)) {
        return identifier;
      }
    }
    return null;
  }

  private isStateNameDeclaration(tree: ParseTree | null): boolean {
    const vocabulary = this.parser.vocabulary;
    return (
      tree instanceof TerminalNode &&
      vocabulary.getSymbolicName(tree.symbol.type) === "Identifier" &&
      tree.parent instanceof ParserRuleContext &&
      this.parser.ruleNames[tree.parent.ruleIndex] === "stateBlock"
    );
  }

  private collectEdits(
    oldName: string,
    newName: string,
    tree: ParseTree,
    result: TextEdit[],
  ) {
    if (tree instanceof TerminalNode) {
      this.collectEditsFromTerminalNode(oldName, newName, tree, result);
    }

    for (let i = 0; i < tree.getChildCount(); ++i) {
      this.collectEdits(oldName, newName, tree.getChild(i)!, result);
    }
  }

  private collectEditsFromTerminalNode(
    oldName: string,
    newName: string,
    tree: TerminalNode,
    result: TextEdit[],
  ) {
    if (!this.isIdentifier(tree)) {
      return;
    }

    if (!caseInsensitiveEquals(oldName, tree.getText())) {
      return;
    }

    const helper = new ReferenceIdentificationHelper(this.parser);
    const kind = helper.identify(tree);

    if (kind !== ReferenceKind.STATE && !this.isStateNameDeclaration(tree)) {
      return;
    }

    result.push({ range: treeRange(tree), newText: newName });
  }
}
