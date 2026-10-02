import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rpc_path = fileURLToPath(new URL('../src/rpc.js', import.meta.url));

describe('redirect_console_to_stderr', () => {
	it('keeps every console method off stdout, which carries the protocol', () => {
		const script = `
			const { redirect_console_to_stderr } = await import(${JSON.stringify(rpc_path)});
			redirect_console_to_stderr();
			console.log('log');
			console.info('info');
			console.warn('warn');
			console.debug('debug');
			console.error('error');
			console.dir({ dir: true });
			console.dirxml('dirxml');
			console.table([{ table: 1 }]);
			console.trace('trace');
			console.group('group');
			console.groupCollapsed('groupCollapsed');
			console.groupEnd();
			console.count('count');
			console.time('time');
			console.timeLog('time');
			console.timeEnd('time');
			console.assert(false, 'assert');
		`;
		const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
			encoding: 'utf8',
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('');
		for (const text of [
			'log',
			'dir: true',
			'table',
			'Trace: trace',
			'group',
			'count: 1',
			'assert',
		]) {
			expect(result.stderr).toContain(text);
		}
	});
});
