import { afterEach, describe, expect, it } from 'vitest';
import { redirect_console_to_stderr } from '../src/rpc.js';

const patched = [
	'assert',
	'clear',
	'count',
	'countReset',
	'debug',
	'dir',
	'dirxml',
	'error',
	'group',
	'groupCollapsed',
	'groupEnd',
	'info',
	'log',
	'table',
	'time',
	'timeEnd',
	'timeLog',
	'trace',
	'warn',
];

/** @type {Record<string, (...args: unknown[]) => unknown>} */
const originals = {};
for (const key of patched) originals[key] = console[key];

afterEach(() => {
	for (const key of patched) console[key] = originals[key];
});

/**
 * @param {NodeJS.WriteStream} stream
 * @param {string[]} chunks
 */
function capture(stream, chunks) {
	const write = stream.write;
	stream.write = (chunk, encoding, callback) => {
		chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
		const done = typeof encoding === 'function' ? encoding : callback;
		if (typeof done === 'function') done();
		return true;
	};
	return () => {
		stream.write = write;
	};
}

describe('redirect_console_to_stderr', () => {
	it('sends stdout console methods to stderr', () => {
		/** @type {string[]} */
		const stdout = [];
		/** @type {string[]} */
		const stderr = [];
		const restore_stdout = capture(process.stdout, stdout);
		const restore_stderr = capture(process.stderr, stderr);
		try {
			redirect_console_to_stderr();
			console.log('log-line');
			console.info('info-line');
			console.debug('debug-line');
			console.dir({ dir: true });
			console.table([{ table: 1 }]);
			console.trace('trace-line');
			console.count('count-line');
			console.group('group-line');

			const text = stderr.join('');
			expect(text).toContain('log-line');
			expect(text).toContain('info-line');
			expect(text).toContain('debug-line');
			expect(text).toContain('dir');
			expect(text).toContain('table');
			expect(text).toContain('trace-line');
			expect(text).toContain('count-line');
			expect(text).toContain('group-line');
			expect(stdout.join('')).toBe('');
		} finally {
			restore_stdout();
			restore_stderr();
		}
	});
});
