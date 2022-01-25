// based on https://github.com/forrestthewoods/lib_fts/blob/master/code/fts_fuzzy_match.js

const SEQUENTIAL_BONUS = 30; // bonus for adjacent matches
const SEPARATOR_BONUS = 30; // bonus if match occurs after a separator
const CAMEL_BONUS = 30; // bonus if match is uppercase and prev is lower
const FIRST_LETTER_BONUS = 15; // bonus if the first letter is matched

const LEADING_LETTER_PENALTY = -15; // penalty applied for every letter in str before the first match
const MAX_LEADING_LETTER_PENALTY = -200; // maximum penalty for leading letters
const UNMATCHED_LETTER_PENALTY = -5;

/**
 * Returns true if each character in pattern is found sequentially within target
 * @param {*} pattern string
 * @param {*} target string
 */
function fuzzyMatchSimple(pattern: string, target: string): boolean {
	let patternIdx = 0;
	let strIdx = 0;

	while (patternIdx < pattern.length && strIdx < target.length) {
		const patternChar = pattern.charAt(patternIdx).toLowerCase();
		const targetChar = target.charAt(strIdx).toLowerCase();
		if (patternChar === targetChar) {
			patternIdx++;
		}
		++strIdx;
	}

	return pattern.length !== 0 && target.length !== 0 && patternIdx === pattern.length;
}

/**
 * Does a fuzzy search to find pattern inside a string.
 * @param {*} pattern string        pattern to search for
 * @param {*} target     string        string which is being searched
 * @returns [boolean, number]       a boolean which tells if pattern was
 *                                  found or not and a search score
 */
function fuzzyMatch(pattern: string, target: string): [boolean, number] {
	const recursionCount = 0;
	const recursionLimit = 5;
	const matches: number[] = [];
	const maxMatches = 256;

	return fuzzyMatchRecursive(
		pattern,
		target,
		0 /* patternCurIndex */,
		0 /* strCurrIndex */,
		null /* srcMatces */,
		matches,
		maxMatches,
		0 /* nextMatch */,
		recursionCount,
		recursionLimit,
	);
}

function fuzzyMatchRecursive(
	pattern: string,
	target: string,
	patternCurIndex: number,
	targetCurrIndex: number,
	targetMatches: null | number[],
	matches: number[],
	maxMatches: number,
	nextMatch: number,
	recursionCount: number,
	recursionLimit: number,
): [boolean, number] {
	let outScore = 0;

	// Return if recursion limit is reached.
	if (++recursionCount >= recursionLimit) {
		return [false, outScore];
	}

	// Return if we reached ends of strings.
	if (patternCurIndex === pattern.length || targetCurrIndex === target.length) {
		return [false, outScore];
	}

	// Recursion params
	let recursiveMatch = false;
	let bestRecursiveMatches: number[] = [];
	let bestRecursiveScore = 0;

	// Loop through pattern and str looking for a match.
	let firstMatch = true;
	while (patternCurIndex < pattern.length && targetCurrIndex < target.length) {
		// Match found.
		if (
			pattern[patternCurIndex].toLowerCase() === target[targetCurrIndex].toLowerCase()
		) {
			if (nextMatch >= maxMatches) {
				return [false, outScore];
			}

			if (firstMatch && targetMatches) {
				matches = [...targetMatches];
				firstMatch = false;
			}

			const recursiveMatches: number[] = [];
			const [matched, recursiveScore] = fuzzyMatchRecursive(
				pattern,
				target,
				patternCurIndex,
				targetCurrIndex + 1,
				matches,
				recursiveMatches,
				maxMatches,
				nextMatch,
				recursionCount,
				recursionLimit,
			);

			if (matched) {
				// Pick best recursive score.
				if (!recursiveMatch || recursiveScore > bestRecursiveScore) {
					bestRecursiveMatches = [...recursiveMatches];
					bestRecursiveScore = recursiveScore;
				}
				recursiveMatch = true;
			}

			matches[nextMatch++] = targetCurrIndex;
			++patternCurIndex;
		}
		++targetCurrIndex;
	}

	const matched = patternCurIndex === pattern.length;

	if (matched) {
		outScore = 100;

		// Apply leading letter penalty
		let penalty = LEADING_LETTER_PENALTY * matches[0];
		penalty =
			penalty < MAX_LEADING_LETTER_PENALTY
				? MAX_LEADING_LETTER_PENALTY
				: penalty;
		outScore += penalty;

		//Apply unmatched penalty
		const unmatched = target.length - nextMatch;
		outScore += UNMATCHED_LETTER_PENALTY * unmatched;

		// Apply ordering bonuses
		for (let i = 0; i < nextMatch; i++) {
			const currIdx = matches[i];

			if (i > 0) {
				const prevIdx = matches[i - 1];
				if (currIdx == prevIdx + 1) {
					outScore += SEQUENTIAL_BONUS;
				}
			}

			// Check for bonuses based on neighbor character value.
			if (currIdx > 0) {
				// Camel case
				const neighbor = target[currIdx - 1];
				const curr = target[currIdx];
				if (
					neighbor !== neighbor.toUpperCase() &&
					curr !== curr.toLowerCase()
				) {
					outScore += CAMEL_BONUS;
				}
				const isNeighbourSeparator = neighbor == "_" || neighbor == " ";
				if (isNeighbourSeparator) {
					outScore += SEPARATOR_BONUS;
				}
			} else {
				// First letter
				outScore += FIRST_LETTER_BONUS;
			}
		}

		// Return best result
		if (recursiveMatch && (!matched || bestRecursiveScore > outScore)) {
			// Recursive score is better than "this"
			matches = [...bestRecursiveMatches];
			outScore = bestRecursiveScore;
			return [true, outScore];
		} else if (matched) {
			// "this" score is better than recursive
			return [true, outScore];
		} else {
			return [false, outScore];
		}
	}
	return [false, outScore];
}

// prop = 'key'
// prop = 'key1.key2'
// prop = ['key1', 'key2']
function getValue(obj: any, prop: string): string | string[] {
	if (typeof obj !== 'object') {
		return obj;
	}

	if (obj.hasOwnProperty(prop)) {
		return obj[prop];
	}

	const segments = prop.split('.');
	let result = obj;
	let i = 0;
	while (result && i < segments.length) {
		result = result[segments[i]];
		i++;
	}
	return result;
}

type Result = {
	score: number;
	item: any;
};

export function search(filter: string, data: Array<object>, keys: Array<{key: string, weight: number}>) {
	const results: Array<Result | null> = data.map((item) => {
		let values: Array<{value: string, weight: number}> = [];
		keys.forEach(({key, weight}) => {
			const value = getValue(item, key);
			if (Array.isArray(value)) {
				values = values.concat(value.map((v) => ({value: v, weight})));
			}
			else if (value) {
				values = values.concat({
					value,
					weight,
				});
			}
		});

		const itemMatch = values.reduce((accu: null | [boolean, number], {value, weight}: {value: string, weight: number}) => {
			if (!fuzzyMatchSimple(filter, value)) {
				return accu;
			}

			const match = fuzzyMatch(filter, value);
			match[1] *= weight;
			if (!accu && match[0]) {
				return match;
			}
			if (match[0] && accu && match[1] > accu[1]) {
				return match;
			}
			return accu;
		}, null);

		if (!itemMatch) {
			return null;
		}

		return {
			score: itemMatch[1],
			item,
		};
	});
	// @ts-ignore
	const matched: Array<Result> = results.filter((item: Result | null): boolean => item !== null);

	matched.sort((a: Result, b: Result) => {
		return b.score - a.score;
	});

	return matched;
}
