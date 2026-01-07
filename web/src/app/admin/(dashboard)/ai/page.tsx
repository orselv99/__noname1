'use client';

import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { AnimatePresence } from 'framer-motion';
import { Database, Check, Cpu, Info, FileText, Sparkles } from 'lucide-react';
import { MotionDiv } from '@/components/admin/ui/Motion';
import TitleLabel from '@/components/admin/ui/TitleLabel';

// Mock Data
const AVAILABLE_MODELS = [
  { id: 'llama-3-8b', name: 'Llama 3 8B', type: 'LLM', desc: 'Efficient and powerful general-purpose model' },
  { id: 'llama-3-70b', name: 'Llama 3 70B', type: 'LLM', desc: 'High capability model for complex reasoning' },
  { id: 'mistral-7b', name: 'Mistral 7B', type: 'LLM', desc: 'Fast and lightweight model' },
  { id: 'phi-3-mini', name: 'Phi-3 Mini', type: 'SLM', desc: 'Optimized for edge devices and speed' },
  { id: 'nomic-embed', name: 'Nomic Embed', type: 'Embedding', desc: 'High performance text embeddings' },
  { id: 'snowflake-arctic', name: 'Snowflake Arctic', type: 'Embedding', desc: 'Enterprise grade embedding model' },
];

const AVAILABLE_LORAS = [
  { id: 'lora-ko-finance', name: 'Korean Finance Adapter', baseModel: 'llama-3-8b', desc: 'Fine-tuned for Korean financial terminology' },
  { id: 'lora-code-py', name: 'Python Coding Assistant', baseModel: 'mistral-7b', desc: 'Enhanced Python code generation' },
  { id: 'lora-med', name: 'Medical RAG Expert', baseModel: 'llama-3-70b', desc: 'Medical literature analysis adapter' },
  { id: 'lora-ko-general', name: 'Korean General Adapter', baseModel: 'llama-3-8b', desc: 'General Korean language improvement' },
];

export default function AIModelsPage() {
  const { t } = useLanguage();
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>('You are a helpful AI assistant. Answer the user\'s questions based on the provided context.');

  // Filter LoRAs based on selected model
  const recommendedLoras = selectedModel
    ? AVAILABLE_LORAS.filter(lora => lora.baseModel === selectedModel)
    : [];

  const slmModels = AVAILABLE_MODELS.filter(m => m.type === 'LLM' || m.type === 'SLM');
  const embeddingModels = AVAILABLE_MODELS.filter(m => m.type === 'Embedding');

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      <TitleLabel title="Model Configuration" subtitle='Select a base model to see compatible LoRA adapters and configure usage.' />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Model Selection Column */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-xl font-semibold text-blue-400">
            <Database size={20} />
            <h2>Available Models</h2>
          </div>

          {/* SLM / LLM Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider ml-1">Small Language Models (SLM) & LLM</h3>
            <div className="grid gap-3">
              {slmModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isSelected={selectedModel === model.id}
                  onClick={() => setSelectedModel(model.id)}
                />
              ))}
            </div>
          </div>

          {/* Embeddings Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider ml-1">Vector Embeddings</h3>
            <div className="grid gap-3">
              {embeddingModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isSelected={selectedModel === model.id}
                  onClick={() => setSelectedModel(model.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* LoRA Recommendation Column */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-purple-400 flex items-center gap-2">
            <Cpu size={20} />
            Recommended LoRAs
          </h2>

          <div className="min-h-[300px] bg-zinc-900/30 border border-white/5 rounded-2xl p-6 relative">
            <AnimatePresence mode="wait">
              {!selectedModel ? (
                <MotionDiv
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-3"
                >
                  <Info size={32} strokeWidth={1.5} />
                  <p>Select a model from the left to view compatible LoRAs</p>
                </MotionDiv>
              ) : recommendedLoras.length === 0 ? (
                <MotionDiv
                  key="empty"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center justify-center text-gray-500 py-12 gap-3"
                >
                  <Sparkles size={32} strokeWidth={1.5} opacity={0.5} className="text-purple-400" />
                  <p>No specific LoRA adapters found for this model.</p>
                </MotionDiv>
              ) : (
                <div className="grid gap-3">
                  {recommendedLoras.map((lora) => (
                    <MotionDiv
                      key={lora.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-purple-300">{lora.name}</h3>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-purple-400/60 bg-purple-400/10 px-2 py-1 rounded">
                          Compatible
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">{lora.desc}</p>
                    </MotionDiv>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Completion Prompt Section */}
      <div className="space-y-4 pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 text-xl font-semibold text-emerald-400">
          <FileText size={20} />
          <h2>Completion Prompt</h2>
        </div>

        <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-6 space-y-4">
          <p className="text-sm text-gray-400">
            Define the system prompt that will be used for text completion tasks.
            This sets the behavior and persona of the SLM.
          </p>

          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-40 bg-black/50 border border-white/10 rounded-xl p-4 text-gray-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all resize-none font-mono text-sm leading-relaxed"
              placeholder="Enter system prompt..."
            />
            <div className="absolute bottom-4 right-4 text-xs text-gray-600">
              {prompt.length} chars
            </div>
          </div>

          <div className="flex justify-end">
            <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors text-sm">
              Save Prompt Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelCard({ model, isSelected, onClick }: { model: any, isSelected: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all duration-200 group relative overflow-hidden
        ${isSelected
          ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(37,99,235,0.15)]'
          : 'bg-zinc-900/50 border-white/5 hover:border-white/10 hover:bg-zinc-900'
        }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className={`font-semibold ${isSelected ? 'text-blue-400' : 'text-gray-200'}`}>
            {model.name}
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-500 mt-1 inline-block">
            {model.type}
          </span>
        </div>
        {isSelected && (
          <div className="bg-blue-500 rounded-full p-1">
            <Check size={14} className="text-white" />
          </div>
        )}
      </div>
      <p className="text-sm text-gray-400 mt-2">{model.desc}</p>
    </button>
  );
}
