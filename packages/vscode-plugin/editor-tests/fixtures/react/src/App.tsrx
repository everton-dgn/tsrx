import { useState } from 'react';

export function App() @{
	const [count, setCount] = useState(0);

	<button onClick={() => setCount(count + 1)}>{count}</button>
}
