import { useState } from 'react';

function App() {
  const [greetMsg, setGreetMsg] = useState('');
  const [name, setName] = useState('');

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
    // setGreetMsg(await invoke("greet", { name }));
    setGreetMsg(`Hello, ${name}! (Backend not connected yet)`);
  }

  return (
    <div className="container p-4 bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-4">Welcome to Fiery Horizon</h1>

      <div className="flex gap-2 mb-4">
        <input
          id="greet-input"
          className="border p-2 rounded text-black"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          type="button"
          onClick={() => greet()}
        >
          Greet
        </button>
      </div>

      <p>{greetMsg}</p>
    </div>
  );
}

export default App;
