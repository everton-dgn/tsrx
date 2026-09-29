/** @import { CompileError } from '../../types/index' */
/** @import { TypeScriptErrorExample } from '../shared/typescript-error-examples.js' */

import { describe, expect, it } from 'vitest';
import { TS_ERRORS, UPSTREAM_ERRORS } from '../../src/diagnostics.js';
import { analyzeTsrx, parseModule } from '../../src/index.js';
import { TYPESCRIPT_ERROR_EXAMPLES, WITHOUT_EXAMPLE } from '../shared/typescript-error-examples.js';

/**
 * What a collecting parse and analysis of `source` report: the errors they
 * record, and the one they throw, if any.
 * @param {string} source
 * @returns {{ errors: CompileError[], thrown: CompileError | null }}
 */
function collect(source) {
	/** @type {CompileError[]} */
	const errors = [];
	try {
		const ast = parseModule(source, 'App.tsrx', { collect: true, errors, comments: [] });
		errors.push(...analyzeTsrx(ast, 'App.tsrx', { collect: true, comments: [] }).errors);
		return { errors, thrown: null };
	} catch (error) {
		return { errors, thrown: /** @type {CompileError} */ (error) };
	}
}

/**
 * Whether `error` is the example's error: the entry's code, and its message,
 * without the location acorn adds to a thrown one.
 * @param {TypeScriptErrorExample} example
 * @param {CompileError} error
 * @returns {boolean}
 */
function is_example_error(example, error) {
	const entry = example.error;
	const message = error.message.replace(/ \(\d+:\d+\)$/, '');
	if (error.code !== entry.code) return false;
	if ('pattern' in entry) return entry.pattern.test(message);
	return (
		message ===
		(typeof entry === 'function' ? entry(...(example.values ?? [])).message : entry.message)
	);
}

describe('TypeScript error examples', () => {
	it('cover every error with a TypeScript code, or say why not', () => {
		const entries = [...Object.values(TS_ERRORS), ...Object.values(UPSTREAM_ERRORS)].filter(
			(entry) => /^TS\d+$/.test(entry.code),
		);
		const with_example = new Set(TYPESCRIPT_ERROR_EXAMPLES.map((example) => example.error));
		const uncovered = entries.filter(
			(entry) => !with_example.has(entry) && !WITHOUT_EXAMPLE.has(entry),
		);
		expect(uncovered.map((entry) => entry.code)).toEqual([]);
		// An error with an example isn't also listed without one.
		expect([...WITHOUT_EXAMPLE.keys()].filter((entry) => with_example.has(entry))).toEqual([]);
	});

	it('make the parser report exactly their error, collected or thrown as each says', () => {
		for (const example of TYPESCRIPT_ERROR_EXAMPLES) {
			const { errors, thrown } = collect(example.source);
			if (example.collected) {
				expect(thrown?.message, example.source).toBeUndefined();
				expect(errors.length, example.source).toBeGreaterThan(0);
				for (const error of errors) {
					expect(is_example_error(example, error), `${example.source}: ${error.message}`).toBe(
						true,
					);
				}
			} else {
				// A file that doesn't compile sends all its errors, so only the thrown
				// one has to be the example's.
				expect(
					thrown && is_example_error(example, thrown),
					`${example.source}: ${thrown?.message}`,
				).toBe(true);
			}
		}
	});
});
