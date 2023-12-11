import { Type } from "./type.js";

export class Parameter {
  private readonly _name: string;
  private readonly _type: Type;
  private readonly _documentation: string;
  private readonly _optional: boolean;

  constructor(
    name: string,
    type: Type,
    documentation: string,
    optional: boolean,
  ) {
    this._name = name;
    this._type = type;
    this._documentation = documentation;
    this._optional = optional;
  }

  public get name(): string {
    return this._name;
  }

  public get type(): Type {
    return this._type;
  }

  public get documentation(): string {
    return this._documentation;
  }

  public get optional(): boolean {
    return this._optional;
  }

  public get signature(): string {
    let result = this.name;

    if (this.optional) {
      result += "?";
    }

    result += `: ${this.type}`;

    return result;
  }
}
