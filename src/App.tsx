/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  Play, 
  Square, 
  Volume2, 
  Settings2, 
  Sparkles, 
  History, 
  Trash2,
  Download,
  Loader2,
  ChevronDown
} from 'lucide-react';
import { generateSpeech, VoiceName } from './lib/gemini';

const VOICES: { name: VoiceName; description: string; gender: string }[] = [
  { name: 'Kore', description: 'Clear and professional', gender: 'Female' },
  { name: 'Puck', description: 'Warm and friendly', gender: 'Male' },
  { name: 'Charon', description: 'Deep and authoritative', gender: 'Male' },
  { name: 'Fenrir', description: 'Energetic and bright', gender: 'Male' },
  { name: 'Zephyr', description: 'Soft and calm', gender: 'Female' },
];

interface HistoryItem {
  id: string;
  text: string;
  voice: VoiceName;
  timestamp: number;
  audioData: string;
}

export default function App() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Kore');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    // Load history from localStorage
    const savedHistory = localStorage.getItem('tts_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('tts_history', JSON.stringify(history));
  }, [history]);

  const playPCM = async (base64Data: string) => {
    if (isPlaying) {
      stopPlayback();
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    const ctx = audioContextRef.current;
    
    // Decode base64 to binary
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Int16Array(len / 2);
    for (let i = 0; i < len; i += 2) {
      bytes[i / 2] = (binaryString.charCodeAt(i) & 0xFF) | ((binaryString.charCodeAt(i + 1) & 0xFF) << 8);
    }

    // Convert Int16 to Float32
    const float32Data = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      float32Data[i] = bytes[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    source.onended = () => {
      setIsPlaying(false);
      sourceNodeRef.current = null;
    };

    sourceNodeRef.current = source;
    setIsPlaying(true);
    source.start();
  };

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleGenerate = async () => {
    if (!text.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      const base64Audio = await generateSpeech(text, selectedVoice);
      
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substring(7),
        text,
        voice: selectedVoice,
        timestamp: Date.now(),
        audioData: base64Audio
      };

      setHistory(prev => [newItem, ...prev].slice(0, 10));
      await playPCM(base64Audio);
    } catch (error) {
      console.error("Failed to generate speech", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('tts_history');
  };

  const downloadAudio = (item: HistoryItem) => {
    const binaryString = window.atob(item.audioData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create a simple WAV header for PCM data
    const wavHeader = new Uint8Array(44);
    const view = new DataView(wavHeader.buffer);
    
    // "RIFF" chunk descriptor
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + len, true); // chunk size
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // "fmt " sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // subchunk1size (16 for PCM)
    view.setUint16(20, 1, true); // audio format (1 for PCM)
    view.setUint16(22, 1, true); // num channels (1)
    view.setUint32(24, 24000, true); // sample rate
    view.setUint32(28, 24000 * 2, true); // byte rate (SampleRate * NumChannels * BitsPerSample/8)
    view.setUint16(32, 2, true); // block align (NumChannels * BitsPerSample/8)
    view.setUint16(34, 16, true); // bits per sample
    
    // "data" sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, len, true); // subchunk2size
    
    const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `speech-${item.id}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-[#1A1A1A] selection:text-white">
      {/* Header */}
      <header className="max-w-4xl mx-auto pt-12 px-6 flex justify-between items-end border-b border-[#E5E5E5] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#1A1A1A] animate-pulse" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold opacity-50">Neural Engine Active</span>
          </div>
          <h1 className="text-5xl font-light tracking-tighter">EchoVoice</h1>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-[#1A1A1A] text-white' : 'hover:bg-[#E5E5E5]'}`}
          >
            <Settings2 size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-12">
        {/* Input Section */}
        <div className="md:col-span-2 space-y-8">
          <div className="relative group">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text to convert to speech..."
              className="w-full h-64 bg-white border border-[#E5E5E5] rounded-2xl p-8 text-xl font-light leading-relaxed focus:outline-none focus:border-[#1A1A1A] transition-all resize-none placeholder:opacity-30"
            />
            <div className="absolute bottom-6 right-6 flex items-center gap-4">
              <span className="text-[10px] font-mono opacity-30">{text.length} characters</span>
              {isPlaying ? (
                <button 
                  onClick={stopPlayback}
                  className="w-12 h-12 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center hover:scale-105 transition-transform"
                >
                  <Square size={20} fill="currentColor" />
                </button>
              ) : (
                <button 
                  onClick={handleGenerate}
                  disabled={!text.trim() || isGenerating}
                  className="w-12 h-12 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-20 disabled:scale-100"
                >
                  {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                </button>
              )}
            </div>
          </div>

          {/* Voice Selector */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {VOICES.map((voice) => (
              <button
                key={voice.name}
                onClick={() => setSelectedVoice(voice.name)}
                className={`p-4 rounded-xl border transition-all text-left ${
                  selectedVoice === voice.name 
                    ? 'bg-white border-[#1A1A1A] shadow-sm' 
                    : 'bg-transparent border-[#E5E5E5] hover:border-[#1A1A1A]/30'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-semibold">{voice.name}</span>
                  <span className="text-[9px] uppercase tracking-wider opacity-40">{voice.gender}</span>
                </div>
                <p className="text-[10px] opacity-60 leading-tight">{voice.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar / History */}
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History size={16} className="opacity-40" />
              <h2 className="text-xs font-bold uppercase tracking-widest opacity-40">Recent</h2>
            </div>
            {history.length > 0 && (
              <button 
                onClick={clearHistory}
                className="text-[10px] uppercase tracking-widest font-bold hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {history.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-12 text-center border border-dashed border-[#E5E5E5] rounded-2xl"
                >
                  <Volume2 size={24} className="mx-auto mb-3 opacity-10" />
                  <p className="text-[10px] uppercase tracking-widest opacity-30">No history yet</p>
                </motion.div>
              ) : (
                history.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group bg-white border border-[#E5E5E5] rounded-xl p-4 hover:border-[#1A1A1A] transition-all"
                  >
                    <p className="text-xs line-clamp-2 mb-3 opacity-80 leading-relaxed">
                      {item.text}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => playPCM(item.audioData)}
                          className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center hover:bg-[#1A1A1A] hover:text-white transition-all"
                        >
                          <Play size={12} fill="currentColor" className="ml-0.5" />
                        </button>
                        <span className="text-[10px] font-medium opacity-40">{item.voice}</span>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => downloadAudio(item)}
                          className="p-1.5 hover:bg-[#F5F5F5] rounded-md transition-colors"
                        >
                          <Download size={14} className="opacity-40" />
                        </button>
                        <button 
                          onClick={() => setHistory(h => h.filter(i => i.id !== item.id))}
                          className="p-1.5 hover:bg-[#F5F5F5] rounded-md transition-colors hover:text-red-500"
                        >
                          <Trash2 size={14} className="opacity-40" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-12 mt-12 border-t border-[#E5E5E5] flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Sparkles size={16} className="opacity-20" />
          <span className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-20">Powered by Gemini 2.5 Flash</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="text-[10px] uppercase tracking-widest font-bold opacity-30 hover:opacity-100 transition-opacity">Documentation</a>
          <a href="#" className="text-[10px] uppercase tracking-widest font-bold opacity-30 hover:opacity-100 transition-opacity">API Status</a>
        </div>
      </footer>
    </div>
  );
}
