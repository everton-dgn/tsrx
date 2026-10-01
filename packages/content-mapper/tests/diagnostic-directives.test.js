import { describe, expect, it } from 'vitest';
import * as react from '@tsrx/react';
import { transform_tsrx } from '@tsrx/typescript-plugin/src/transform.js';
import { ignore_directives } from '../src/diagnostic-directives.js';

/**
 * @param {string} content
 * @param {string} file_name
 */
function directives_for(content, file_name) {
	const result = transform_tsrx(react, file_name, content);
	const directives = ignore_directives(
		result.errors,
		result.sourceAst,
		result.mappings,
		content.length,
		result.text.length,
	);
	return { result, directives: directives?.directives ?? [] };
}

/** @param {Array<[number, number, number, number, number]>} directives @param {number} offset */
function covers(directives, offset) {
	return directives.some(([, , start, end]) => start <= offset && offset < end);
}

describe('ignore directives around <script> bodies', () => {
	it('does not hide a later function when a script-body mistake owns the holder', () => {
		const content = `export function C() @{
	<script>const a = '</script x';</script>
}

export function B(): number {
	return "str";
}
`;
		const { result, directives } = directives_for(content, 'Script.tsrx');
		const body = result.text.indexOf("const a = '</script x';");
		const later = result.text.indexOf('return "str"');
		expect(body).toBeGreaterThan(-1);
		expect(later).toBeGreaterThan(-1);
		// The appended body is still ignored, so TypeScript does not repeat the mistake.
		expect(covers(directives, body)).toBe(true);
		// The gap between the JSX tag and that body is the rest of the file.
		expect(covers(directives, later)).toBe(false);
	});

	it('does not hide a later function when the holder merely contains a script', () => {
		const content = `export function A() @{
	<div>
		<script>const n: number = "nope";</script>
		{label;}
	</div>
}

export function B(): number {
	return "str";
}
`;
		const { result, directives } = directives_for(content, 'Holder.tsrx');
		const label = result.text.indexOf('{label}');
		const later = result.text.indexOf('return "str"');
		const body = result.text.indexOf('const n: number = "nope"');
		expect(label).toBeGreaterThan(-1);
		expect(later).toBeGreaterThan(-1);
		expect(body).toBeGreaterThan(-1);
		expect(covers(directives, label)).toBe(true);
		expect(covers(directives, body)).toBe(true);
		expect(covers(directives, later)).toBe(false);
	});
});
