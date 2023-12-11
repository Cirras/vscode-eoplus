import { BaseSymbol } from "antlr4-c3";
import { Parameter } from "./parameter.js";

export class InvocableSymbol extends BaseSymbol {
  private readonly _documentation: string;
  private readonly _parameters: Array<Parameter>;

  constructor(
    name: string,
    documentation: string,
    parameters: Array<Parameter>,
  ) {
    super(name);
    this._documentation = documentation;
    this._parameters = parameters;
  }

  public get documentation(): string {
    return this._documentation;
  }

  public get parameters(): ReadonlyArray<Parameter> {
    return this._parameters;
  }
}
