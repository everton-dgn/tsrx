// Hides every app whose command line contains the marker given as the first argument
// (the editor tests' temporary directory) as soon as it becomes the active app, which
// gives the front back to the app you work in. VS Code brings its first window to the
// front itself, so `open -g -j` cannot keep it in the background. Compiled and run by
// run.js on macOS.
import AppKit

let marker = CommandLine.arguments[1]

/// A process's arguments, read from the kernel (no `ps` to wait for), joined by spaces.
func commandLine(of pid: pid_t) -> String {
	var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, pid]
	var size = 0
	guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > MemoryLayout<Int32>.size else { return "" }
	var buffer = [UInt8](repeating: 0, count: size)
	guard sysctl(&mib, 3, &buffer, &size, nil, 0) == 0 else { return "" }
	// argc, then the executable path and the arguments, each ending in NUL.
	let bytes = buffer[MemoryLayout<Int32>.size..<size].map { $0 == 0 ? UInt8(ascii: " ") : $0 }
	return String(decoding: bytes, as: UTF8.self)
}

/// Whether each process seen so far is a test instance.
var is_test_instance: [pid_t: Bool] = [:]

NSWorkspace.shared.notificationCenter.addObserver(
	forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
) { notification in
	guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
	else { return }
	let pid = app.processIdentifier
	let test_instance = is_test_instance[pid] ?? commandLine(of: pid).contains(marker)
	is_test_instance[pid] = test_instance
	if test_instance { app.hide() }
}
RunLoop.main.run()
