import { CollaborativeEditor } from './components/Editor';

function App() {
  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
            Fiery Horizon Editor
          </h1>
          <p className="text-zinc-400">
            Collaborative editing powered by Rust, Tauri, and Tiptap.
          </p>
        </header>

        <main>
          <CollaborativeEditor />
        </main>
      </div>
    </div>
  );
}

export default App;
