import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESTART_COMMAND, register_restart_command } from '../src/restart.js';

const host = vi.hoisted(() => ({
	use_tsgo: false,
	/** @type {Set<string>} */
	extensions: new Set(),
	/** @type {string[]} */
	commands: [],
	/** @type {Map<string, () => Promise<unknown>>} */
	registered: new Map(),
	executeCommand: vi.fn(),
	setStatusBarMessage: vi.fn(),
	showErrorMessage: vi.fn(),
}));

vi.mock('vscode', () => ({
	default: {
		workspace: {
			getConfiguration: (/** @type {string} */ section) => ({
				inspect: () => ({ globalValue: section === 'js/ts' ? host.use_tsgo : undefined }),
				get: () => (section === 'js/ts' ? host.use_tsgo : undefined),
			}),
		},
		extensions: {
			getExtension: (/** @type {string} */ id) =>
				host.extensions.has(id.toLowerCase()) ? { id } : undefined,
		},
		commands: {
			registerCommand: (/** @type {string} */ id, /** @type {any} */ run) => {
				host.registered.set(id, run);
				return { dispose() {} };
			},
			getCommands: async () => host.commands,
			executeCommand: host.executeCommand,
		},
		window: {
			setStatusBarMessage: host.setStatusBarMessage,
			showErrorMessage: host.showErrorMessage,
		},
	},
}));

beforeEach(() => {
	host.use_tsgo = false;
	host.extensions.clear();
	host.commands = ['typescript.restartTsServer', 'typescript.native-preview.restart'];
	host.registered.clear();
	vi.clearAllMocks();
});

function restart() {
	const client = { restart: vi.fn(async () => {}) };
	register_restart_command(
		() =>
			/** @type {import('vscode-languageclient/node').LanguageClient} */ (
				/** @type {unknown} */ (client)
			),
	);
	return {
		client,
		run: () => /** @type {() => Promise<unknown>} */ (host.registered.get(RESTART_COMMAND))(),
	};
}

describe('TSRX: Restart Language Server', () => {
	it("restarts the TSRX server and VS Code's tsserver while TypeScript 7 is off", async () => {
		const { client, run } = restart();
		await run();
		expect(client.restart).toHaveBeenCalledOnce();
		expect(host.executeCommand).toHaveBeenCalledExactlyOnceWith('typescript.restartTsServer');
		expect(host.setStatusBarMessage).toHaveBeenCalledOnce();
	});

	it('restarts TypeScript 7 while it serves .tsrx files', async () => {
		host.use_tsgo = true;
		host.extensions.add('typescriptteam.native-preview');
		const { client, run } = restart();
		await run();
		expect(client.restart).toHaveBeenCalledOnce();
		expect(host.executeCommand).toHaveBeenCalledExactlyOnceWith(
			'typescript.native-preview.restart',
		);
	});

	it('restarts only the TSRX server when no TypeScript server runs', async () => {
		host.use_tsgo = true;
		host.extensions.add('typescriptteam.vscode-typescript-nightly');
		host.commands = [];
		const { client, run } = restart();
		await run();
		expect(client.restart).toHaveBeenCalledOnce();
		expect(host.executeCommand).not.toHaveBeenCalled();
	});

	it('says so when a restart fails', async () => {
		const { client, run } = restart();
		client.restart.mockRejectedValue(new Error('server crashed'));
		await run();
		expect(host.showErrorMessage).toHaveBeenCalledWith(
			'TSRX could not restart the language server: server crashed',
		);
	});
});
