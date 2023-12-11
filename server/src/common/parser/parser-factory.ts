import {
  ANTLRErrorListener,
  CharStream,
  CommonTokenStream,
  Lexer,
  Parser,
  TokenStream,
} from "antlr4ng";
import { Flavor } from "../flavor.js";
import { FlavorAwareParser } from "./flavor-aware-parser.js";
import { EOPlusLexer as OfficialEOPlusLexer } from "../antlr/generated/official/EOPlusLexer.js";
import { EOPlusParser as OfficialEOPlusParser } from "../antlr/generated/official/EOPlusParser.js";
import { EOPlusLexer as EoservEOPlusLexer } from "../antlr/generated/eoserv/EOPlusLexer.js";
import { EOPlusParser as EoservEOPlusParser } from "../antlr/generated/eoserv/EOPlusParser.js";

export class ParserFactory {
  private readonly flavor: Flavor;
  private readonly lexerErrorListeners: ANTLRErrorListener[];
  private readonly parserErrorListeners: ANTLRErrorListener[];

  public constructor(flavor: Flavor) {
    this.flavor = flavor;
    this.lexerErrorListeners = [];
    this.parserErrorListeners = [];
  }

  public addLexerErrorListener(errorListener: ANTLRErrorListener) {
    this.lexerErrorListeners.push(errorListener);
  }

  public addParserErrorListener(errorListener: ANTLRErrorListener) {
    this.parserErrorListeners.push(errorListener);
  }

  public create(code: CharStream): FlavorAwareParser {
    const lexer = this.createLexer(code);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = this.createParser(tokenStream);

    const flavor = this.flavor;
    Object.defineProperty(parser, "flavor", {
      get: function () {
        return flavor;
      },
    });

    const keywords = this.findKeywords(parser);
    Object.defineProperty(parser, "isKeyword", {
      value: (tokenType: number) => {
        return keywords.has(tokenType);
      },
      writable: false,
    });

    return parser as FlavorAwareParser;
  }

  private createLexer(code: CharStream): Lexer {
    let lexer: Lexer;
    switch (this.flavor) {
      case Flavor.OFFICIAL: {
        lexer = new OfficialEOPlusLexer(code);
        break;
      }

      case Flavor.EOSERV: {
        lexer = new EoservEOPlusLexer(code);
        break;
      }

      default:
        throw new Error(`Unhandled flavor: ${this.flavor}`);
    }

    lexer.removeErrorListeners();
    for (let listener of this.lexerErrorListeners) {
      lexer.addErrorListener(listener);
    }

    return lexer;
  }

  private createParser(tokenStream: TokenStream): Parser {
    let parser: Parser;
    switch (this.flavor) {
      case Flavor.OFFICIAL: {
        parser = new OfficialEOPlusParser(tokenStream);
        break;
      }

      case Flavor.EOSERV: {
        parser = new EoservEOPlusParser(tokenStream);
        break;
      }

      default:
        throw new Error(`Unhandled flavor: ${this.flavor}`);
    }

    parser.removeErrorListeners();
    for (let listener of this.parserErrorListeners) {
      parser.addErrorListener(listener);
    }

    return parser;
  }

  private findKeywords(parser: Parser): Set<number> {
    const result = new Set<number>();

    for (let i = 1; i <= parser.vocabulary.maxTokenType; ++i) {
      if (parser.vocabulary.getSymbolicName(i) === "LPAREN") {
        // LPAREN is the first token declared in the lexer grammar after keywords
        break;
      }
      result.add(i);
    }

    return result;
  }
}
