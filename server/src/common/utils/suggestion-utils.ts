/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

/**
 * Given a name and a list of names that are *not* equal to the name, return a spelling suggestion if there is one that is close enough.
 * Names less than length 3 only check for case-insensitive equality.
 *
 * find the candidate with the smallest Levenshtein distance,
 *    except for candidates:
 *      * With no name
 *      * Whose length differs from the target name by more than 0.34 of the length of the name.
 *      * Whose levenshtein distance is more than 0.4 of the length of the name
 *        (0.4 allows 1 substitution/transposition for every 5 characters,
 *         and 1 insertion/deletion at 3 characters)
 */
export function getSpellingSuggestion<T>(
  name: string,
  candidates: T[],
  getName: (candidate: T) => string | undefined,
): T | undefined {
  const maximumLengthDifference = Math.max(2, Math.floor(name.length * 0.34));
  let bestDistance = Math.floor(name.length * 0.4) + 1; // If the best result is worse than this, don't bother.
  let bestCandidate: T | undefined;
  for (const candidate of candidates) {
    const candidateName = getName(candidate);
    if (
      candidateName !== undefined &&
      Math.abs(candidateName.length - name.length) <= maximumLengthDifference
    ) {
      if (candidateName === name) {
        continue;
      }
      // Only consider candidates less than 3 characters long when they differ by case.
      // Otherwise, don't bother, since a user would usually notice differences of a 2-character name.
      if (
        candidateName.length < 3 &&
        candidateName.toLowerCase() !== name.toLowerCase()
      ) {
        continue;
      }

      const distance = levenshteinWithMax(
        name,
        candidateName,
        bestDistance - 0.1,
      );
      if (distance === undefined) {
        continue;
      }

      console.assert(distance < bestDistance); // Else `levenshteinWithMax` should return undefined
      bestDistance = distance;
      bestCandidate = candidate;
    }
  }
  return bestCandidate;
}

function levenshteinWithMax(
  s1: string,
  s2: string,
  max: number,
): number | undefined {
  let previous = new Array(s2.length + 1);
  let current = new Array(s2.length + 1);
  /** Represents any value > max. We don't care about the particular value. */
  const big = max + 0.01;

  for (let i = 0; i <= s2.length; i++) {
    previous[i] = i;
  }

  for (let i = 1; i <= s1.length; i++) {
    const c1 = s1.charCodeAt(i - 1);
    const minJ = Math.ceil(i > max ? i - max : 1);
    const maxJ = Math.floor(s2.length > max + i ? max + i : s2.length);
    current[0] = i;
    /** Smallest value of the matrix in the ith column. */
    let colMin = i;
    for (let j = 1; j < minJ; j++) {
      current[j] = big;
    }
    for (let j = minJ; j <= maxJ; j++) {
      // case difference should be significantly cheaper than other differences
      const substitutionDistance =
        s1[i - 1].toLowerCase() === s2[j - 1].toLowerCase()
          ? previous[j - 1] + 0.1
          : previous[j - 1] + 2;
      const dist =
        c1 === s2.charCodeAt(j - 1)
          ? previous[j - 1]
          : Math.min(
              /*delete*/ previous[j] + 1,
              /*insert*/ current[j - 1] + 1,
              /*substitute*/ substitutionDistance,
            );
      current[j] = dist;
      colMin = Math.min(colMin, dist);
    }
    for (let j = maxJ + 1; j <= s2.length; j++) {
      current[j] = big;
    }
    if (colMin > max) {
      // Give up -- everything in this column is > max and it can't get better in future columns.
      return undefined;
    }

    const temp = previous;
    previous = current;
    current = temp;
  }

  const res = previous[s2.length];
  return res > max ? undefined : res;
}
