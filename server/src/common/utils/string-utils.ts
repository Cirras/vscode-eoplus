export function caseInsensitiveEquals(s1: string, s2: string): boolean {
  return s1.localeCompare(s2, undefined, { sensitivity: "accent" }) === 0;
}

export function capitalize(str: string): string {
  if (str.length === 0) {
    return str;
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}
