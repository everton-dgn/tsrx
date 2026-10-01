/** @import * as AST from 'estree' */
/** @import {CodeMapping, CompileError} from '@tsrx/core/types' */
/** @import {DiagnosticDirectives} from './protocol.js' */

import { DiagnosticDirectivePolicy } from './protocol.js';

/**
 * The nodes whose generated code an error's directive covers: the innermost
 * statement, declaration, class or type member, or element that holds the
 * error.
 */
const HOLDER_TYPE =
	/(?:Statement|Declaration|Definition|Signature)$|^(?:StaticBlock|AccessorProperty|JSXElement|JSXFragment|JSXStyleElement)$/;

/** Keys of a tree node that hold no child nodes, or nodes that aren't its children. */
const NOT_CHILDREN = new Set([
	'metadata',
	'loc',
	'range',
	'parent',
	'comments',
	'leadingComments',
	'trailingComments',
]);

/**
 * An `ignore` directive for each error the mapper reports, so that a mistake
 * shows once. TypeScript reports some mistakes itself from the generated code,
 * with a code of its own, and would show them next to the mapper's error. The
 * directive hides TypeScript's errors in the generated code of the statement,
 * class or type member, or element that holds the error, until the error is
 * fixed and the mapper stops sending it. The mapper's own errors are not
 * TypeScript's, so they stay.
 *
 * The ranges come from what every TSRX compiler returns, whatever its target:
 * the source tree (`sourceAst`) finds the node that holds an error, and the
 * mappings give that node's generated code. Without a source tree the error's
 * own span stands in. A node without mappings gets no directive.
 * @param {readonly CompileError[]} errors
 * @param {AST.Program | null} source_ast
 * @param {readonly CodeMapping[]} mappings
 * @param {number} original_length
 * @param {number} generated_length
 * @returns {DiagnosticDirectives | null}
 */
export function ignore_directives(errors, source_ast, mappings, original_length, generated_length) {
	/** @type {Array<[original_start: number, original_end: number, generated_start: number, generated_end: number]>} */
	const ranges = [];
	for (const error of errors) {
		if (typeof error.pos !== 'number') {
			continue;
		}
		const holder = source_ast ? holder_at(source_ast, error.pos) : null;
		const start = holder ? /** @type {number} */ (holder.start) : error.pos;
		const end = holder
			? /** @type {number} */ (holder.end)
			: typeof error.end === 'number' && error.end > error.pos
				? error.end
				: error.pos + 1;
		for (const generated of generated_ranges(mappings, start, end)) {
			ranges.push([
				Math.min(start, original_length),
				Math.min(end, original_length),
				Math.min(generated[0], generated_length),
				Math.min(generated[1], generated_length),
			]);
		}
	}
	if (ranges.length === 0) {
		return null;
	}

	// TypeScript rejects directives whose generated ranges overlap.
	ranges.sort((a, b) => a[2] - b[2]);
	/** @type {typeof ranges} */
	const merged = [];
	for (const range of ranges) {
		const last = merged.at(-1);
		if (last && range[2] < last[3]) {
			last[0] = Math.min(last[0], range[0]);
			last[1] = Math.max(last[1], range[1]);
			last[3] = Math.max(last[3], range[3]);
		} else {
			merged.push([...range]);
		}
	}
	return {
		unusedExpectDirectiveDiagnostics: [],
		directives: merged.map(([original_start, original_end, generated_start, generated_end]) => [
			original_start,
			original_end - original_start,
			generated_start,
			generated_end,
			DiagnosticDirectivePolicy.Ignore,
		]),
	};
}

/**
 * The innermost holder node (see {@link HOLDER_TYPE}) that contains `position`,
 * found by descending from the root through the child that contains it.
 * @param {AST.Node} root
 * @param {number} position
 * @returns {AST.Node | null}
 */
function holder_at(root, position) {
	/** @type {AST.Node | null} */
	let holder = null;
	/** @type {AST.Node | null} */
	let node = root;
	while (node) {
		if (HOLDER_TYPE.test(node.type)) {
			holder = node;
		}
		node = child_at(node, position);
	}
	return holder;
}

/**
 * @param {AST.Node} node
 * @param {number} position
 * @returns {AST.Node | null}
 */
function child_at(node, position) {
	for (const [key, value] of Object.entries(node)) {
		if (NOT_CHILDREN.has(key) || !value || typeof value !== 'object') {
			continue;
		}
		for (const child of Array.isArray(value) ? value : [value]) {
			if (
				child &&
				typeof child.type === 'string' &&
				typeof child.start === 'number' &&
				typeof child.end === 'number' &&
				child.start <= position &&
				position < child.end
			) {
				return child;
			}
		}
	}
	return null;
}

/**
 * Generated ranges of the mapped code between `start` and `end`. Segments in
 * the JSX form one range, from the first to the last generated offset, so
 * synthesized code between them is covered. An appended `<script>` body is
 * mapped at the end of the file (its mapping carries `customData.embeddedId`)
 * while the tag stays in the JSX; one range over both would cover that gap and
 * hide TypeScript diagnostics for the rest of the component, so the body is
 * its own range. A segment of the same length on both sides that encloses the
 * range, as a verbatim `<script>` body does, gives the matching part of its
 * generated text.
 * @param {readonly CodeMapping[]} mappings
 * @param {number} start
 * @param {number} end
 * @returns {Array<[number, number]>}
 */
function generated_ranges(mappings, start, end) {
	let inline_start = Infinity;
	let inline_end = -Infinity;
	let embedded_start = Infinity;
	let embedded_end = -Infinity;
	for (const mapping of mappings) {
		const embedded = typeof mapping.data?.customData?.embeddedId === 'string';
		for (let i = 0; i < mapping.sourceOffsets.length; i++) {
			const source = mapping.sourceOffsets[i];
			const length = mapping.lengths[i];
			const generated = mapping.generatedOffsets[i];
			const generated_length = mapping.generatedLengths?.[i] ?? length;
			/** @type {[number, number] | null} */
			let span = null;
			if (source >= start && source + length <= end) {
				span = [generated, generated + generated_length];
			} else if (source <= start && end <= source + length && generated_length === length) {
				span = [generated + start - source, generated + end - source];
			}
			if (!span) continue;
			if (embedded) {
				embedded_start = Math.min(embedded_start, span[0]);
				embedded_end = Math.max(embedded_end, span[1]);
			} else {
				inline_start = Math.min(inline_start, span[0]);
				inline_end = Math.max(inline_end, span[1]);
			}
		}
	}
	/** @type {Array<[number, number]>} */
	const ranges = [];
	if (inline_end > inline_start) ranges.push([inline_start, inline_end]);
	if (embedded_end > embedded_start) ranges.push([embedded_start, embedded_end]);
	return ranges;
}
