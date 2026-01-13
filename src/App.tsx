import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Play, Square, Download, 
  Music, Volume2, Trash2, Plus, X, ListMusic, ChevronDown,
  FlaskConical
} from 'lucide-react';

/**
 * ==========================================
 * UTILITAIRES MIDI (Mini Writer)
 * ==========================================
 */

class MidiWriter {
  // Convertit un nombre en Variable Length Quantity (VLQ) MIDI
  static toVLQ(n: number): number[] {
    let buffer = [n & 0x7f];
    while (n >>= 7) buffer.push((n & 0x7f) | 0x80);
    return buffer.reverse();
  }

  static createMidiFile(tempo: number, drumGrid: boolean[][], chords: ChordItem[]) {
    const ticksPerQuarter = 480;
    const ticksPerStep = ticksPerQuarter / 4; // 1/16 note

    // Header Chunk
    const header = [
      0x4d, 0x54, 0x68, 0x64, // "MThd"
      0x00, 0x00, 0x00, 0x06, // Length
      0x00, 0x01,             // Format 1 (Multiple tracks)
      0x00, 0x02,             // 2 Tracks (1 Tempo/Drums, 1 Chords)
      (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff
    ];

    // Track 1: Tempo & Drums (Channel 10)
    let drumEvents: number[] = [];
    const microsecondsPerQuarter = Math.round(60000000 / tempo);
    
    // Set Tempo Meta Event
    drumEvents.push(0x00, 0xff, 0x51, 0x03, 
      (microsecondsPerQuarter >> 16) & 0xff, 
      (microsecondsPerQuarter >> 8) & 0xff, 
      microsecondsPerQuarter & 0xff
    );

    // Write Drum Notes
    let lastTick = 0;
    const drumNotesEvents: {tick: number, status: number, data: number[]}[] = [];

    drumGrid.forEach((track, trackIdx) => {
      const midiNote = DRUM_TRACKS[trackIdx].midiNote;
      track.forEach((active, stepIdx) => {
        if (active) {
          const startTick = stepIdx * ticksPerStep;
          const endTick = startTick + (ticksPerStep - 1);
          drumNotesEvents.push({ tick: startTick, status: 0x99, data: [midiNote, 0x64] });
          drumNotesEvents.push({ tick: endTick, status: 0x89, data: [midiNote, 0x00] });
        }
      });
    });

    drumNotesEvents.sort((a, b) => a.tick - b.tick);
    drumNotesEvents.forEach(e => {
      const delta = e.tick - lastTick;
      drumEvents.push(...this.toVLQ(delta));
      drumEvents.push(e.status, ...e.data);
      lastTick = e.tick;
    });
    drumEvents.push(0x00, 0xff, 0x2f, 0x00); // End of Track

    const drumTrack = [
      0x4d, 0x54, 0x72, 0x6b,
      ...this.int32ToBytes(drumEvents.length),
      ...drumEvents
    ];

    // Track 2: Chords (Channel 1)
    let chordEvents: number[] = [];
    let lastChordTick = 0;
    const chordNotesEvents: {tick: number, status: number, data: number[]}[] = [];

    chords.forEach((chord, idx) => {
      const rootIdx = NOTES_NAMES.indexOf(chord.root);
      const basePitch = 60 + rootIdx;
      const intervals = CHORD_TYPES[chord.type];
      const startTick = idx * (ticksPerStep * 16);
      const endTick = startTick + (ticksPerStep * 16) - 1;

      intervals.forEach(interval => {
        chordNotesEvents.push({ tick: startTick, status: 0x90, data: [basePitch + interval, 0x50] });
        chordNotesEvents.push({ tick: endTick, status: 0x80, data: [basePitch + interval, 0x00] });
      });
    });

    chordNotesEvents.sort((a, b) => a.tick - b.tick);
    chordNotesEvents.forEach(e => {
      const delta = e.tick - lastChordTick;
      chordEvents.push(...this.toVLQ(delta));
      chordEvents.push(e.status, ...e.data);
      lastChordTick = e.tick;
    });
    chordEvents.push(0x00, 0xff, 0x2f, 0x00);

    const chordTrack = [
      0x4d, 0x54, 0x72, 0x6b,
      ...this.int32ToBytes(chordEvents.length),
      ...chordEvents
    ];

    return new Uint8Array([...header, ...drumTrack, ...chordTrack]);
  }

  static int32ToBytes(n: number) {
    return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }

  static download(data: Uint8Array, filename: string) {
    const blob = new Blob([data], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * ==========================================
 * UTILITAIRES : TYPES & CONSTANTES
 * ==========================================
 */

type Note = {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
};

type DrumTrack = {
  id: number;
  name: string;
  audioKey: string;
  midiNote: number;
  color: string;
};

type ChordItem = {
  id: number;
  root: string;
  type: string;
  name: string;
};

const NOTES_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const DRUM_TRACKS: DrumTrack[] = [
  { id: 0, name: 'KICK', audioKey: 'Kick', midiNote: 36, color: 'bg-red-600' },
  { id: 1, name: 'SNARE', audioKey: 'Snare', midiNote: 38, color: 'bg-cyan-500' },
  { id: 2, name: 'HATS FERMÉ', audioKey: 'Hi-Hat Closed', midiNote: 42, color: 'bg-orange-600' },
  { id: 3, name: 'HATS OUVERT', audioKey: 'Hi-Hat Open', midiNote: 46, color: 'bg-yellow-500' },
];

const CHORD_TYPES: Record<string, number[]> = {
  'Majeur': [0, 4, 7], 'Mineur': [0, 3, 7], '7': [0, 4, 7, 10], 'Maj7': [0, 4, 7, 11],
  'm7': [0, 3, 7, 10], 'dim': [0, 3, 6], 'aug': [0, 4, 8], 'sus4': [0, 5, 7], 'sus2': [0, 2, 7]
};

/**
 * ==========================================
 * MOTEUR AUDIO (Web Audio API)
 * ==========================================
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  noiseBuffer: AudioBuffer | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);
      this.createNoiseBuffer();
    }
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
  }

  createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  playDrum(trackKey: string, time: number) {
    if (!this.ctx || !this.masterGain) return;
    if (trackKey === 'Kick') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
      gain.gain.setValueAtTime(1, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
      osc.connect(gain); gain.connect(this.masterGain);
      osc.start(time); osc.stop(time + 0.5);
    } else if (trackKey === 'Snare') {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'highpass'; noiseFilter.frequency.value = 1000;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(1, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(this.masterGain);
      noise.start(time); noise.stop(time + 0.2);
    } else if (trackKey.includes('Hi-Hat')) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 8000;
      const gain = this.ctx.createGain();
      const duration = trackKey.includes('Open') ? 0.3 : 0.05;
      gain.gain.setValueAtTime(0.6, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
      noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
      noise.start(time); noise.stop(time + duration);
    }
  }

  playNote(note: Note, time: number, instr: string, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(freq, time);
    if (instr === 'pad') {
      osc.type = 'triangle';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 1200;
      osc.connect(filter); filter.connect(gain);
    } else {
      osc.type = 'triangle'; osc.connect(gain);
    }
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.2, time + 0.02);
    gain.gain.setTargetAtTime(0, time + duration * 0.9, 0.1);
    gain.connect(this.masterGain);
    osc.start(time); osc.stop(time + duration + 0.5);
  }
}

const audio = new AudioEngine();

/**
 * ==========================================
 * COMPOSANTS UI
 * ==========================================
 */

const Select = ({ label, value, options, onChange, className = "" }: any) => (
  <div className={`w-full ${className}`}>
    {label && <label className="block text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">{label}</label>}
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-[#1a212c] text-gray-100 text-sm border border-gray-700/50 rounded-lg p-3 pr-10 focus:ring-1 focus:ring-cyan-500/50 focus:outline-none transition-all shadow-inner"
      >
        {options.map((opt: any) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500">
        <ChevronDown size={16} />
      </div>
    </div>
  </div>
);

const Slider = ({ value, min, max, onChange }: any) => (
  <div className="relative flex items-center w-full h-8">
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="w-full h-[6px] bg-[#2d3748] rounded-full appearance-none cursor-pointer accent-white"
    />
  </div>
);

const Button = ({ children, onClick, variant = 'primary', icon: Icon, className = '' }: any) => {
  const baseStyle = "flex items-center justify-center px-5 py-3 rounded-lg font-bold transition-all text-sm active:scale-[0.98] shadow-lg whitespace-nowrap";
  const variants: Record<string, string> = {
    primary: "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/20",
    secondary: "bg-[#1a212c] hover:bg-[#252d3a] text-gray-200 border border-gray-700/50",
    danger: "bg-red-900/30 hover:bg-red-900/50 text-red-200 border border-red-900/50",
    success: "bg-emerald-600 hover:bg-emerald-500 text-white",
    accent: "bg-indigo-600 text-white"
  };
  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`}>
      {Icon && <Icon size={18} className="mr-2" />}
      {children}
    </button>
  );
};

const App = () => {
  const [tempo, setTempo] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'drums' | 'chords'>('drums');
  
  // Batterie
  const [drumBars, setDrumBars] = useState(1);
  const [drumGrid, setDrumGrid] = useState<boolean[][]>(DRUM_TRACKS.map(() => Array(16).fill(false)));
  
  // Accords
  const [chordProgression, setChordProgression] = useState<ChordItem[]>([
    { id: 1, root: 'C', type: 'm7', name: 'C m7' },
    { id: 2, root: 'F', type: 'Majeur', name: 'F Majeur' },
    { id: 3, root: 'G', type: '7', name: 'G 7' },
    { id: 4, root: 'C', type: 'm7', name: 'C m7' },
  ]);
  const [newChordRoot, setNewChordRoot] = useState('C');
  const [newChordType, setNewChordType] = useState('Majeur');

  const [currentStep, setCurrentStep] = useState(0);
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const timerIDRef = useRef<number | null>(null);

  const tempoRef = useRef(tempo);
  const activeTabRef = useRef(activeTab);
  const chordProgressionRef = useRef(chordProgression);
  const drumGridRef = useRef(drumGrid);
  const drumBarsRef = useRef(drumBars);

  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { chordProgressionRef.current = chordProgression; }, [chordProgression]);
  useEffect(() => { drumGridRef.current = drumGrid; }, [drumGrid]);
  useEffect(() => { drumBarsRef.current = drumBars; }, [drumBars]);

  useEffect(() => {
    const targetSteps = drumBars * 16;
    setDrumGrid(prev => DRUM_TRACKS.map((_, i) => {
      const oldRow = prev[i] || [];
      const newRow = Array(targetSteps).fill(false);
      for (let j = 0; j < Math.min(oldRow.length, targetSteps); j++) newRow[j] = oldRow[j];
      return newRow;
    }));
  }, [drumBars]);

  const togglePlay = async () => {
    if (!isPlaying) {
      if (!audio.ctx) audio.init();
      await audio.resume();
      setIsPlaying(true);
    } else setIsPlaying(false);
  };

  const handleExportMidi = () => {
    try {
      const midiData = MidiWriter.createMidiFile(tempo, drumGrid, chordProgression);
      MidiWriter.download(midiData, `pattern-lab-${Date.now()}.mid`);
    } catch (error) {
      console.error("Export MIDI failed", error);
    }
  };

  const scheduler = useCallback(() => {
    if (!audio.ctx) return;
    const secondsPerStep = (60.0 / tempoRef.current) / 4;
    
    while (nextNoteTimeRef.current < audio.ctx.currentTime + 0.1) {
      const step = stepRef.current;
      requestAnimationFrame(() => setCurrentStep(step));
      
      if (activeTabRef.current === 'drums') {
        DRUM_TRACKS.forEach((track, i) => {
          if (drumGridRef.current[i][step]) audio.playDrum(track.audioKey, nextNoteTimeRef.current);
        });
      } else if (activeTabRef.current === 'chords') {
        if (chordProgressionRef.current.length > 0 && step % 16 === 0) {
          const barIndex = Math.floor(step / 16) % chordProgressionRef.current.length;
          const chord = chordProgressionRef.current[barIndex];
          if (chord) {
            const rootIdx = NOTES_NAMES.indexOf(chord.root);
            const basePitch = 60 + rootIdx;
            const intervals = CHORD_TYPES[chord.type];
            intervals.forEach(interval => {
              audio.playNote({ pitch: basePitch + interval, startTime: 0, duration: 16, velocity: 80 }, nextNoteTimeRef.current, 'pad', 16 * secondsPerStep);
            });
          }
        }
      }
      
      nextNoteTimeRef.current += secondsPerStep;
      let maxSteps = 16;
      if (activeTabRef.current === 'drums') maxSteps = drumBarsRef.current * 16;
      else if (activeTabRef.current === 'chords') maxSteps = chordProgressionRef.current.length * 16;
      
      stepRef.current = (stepRef.current + 1) % (maxSteps || 16);
    }
    timerIDRef.current = window.setTimeout(scheduler, 25);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      nextNoteTimeRef.current = audio.ctx!.currentTime + 0.05;
      stepRef.current = 0;
      scheduler();
    } else if (timerIDRef.current) window.clearTimeout(timerIDRef.current);
    return () => { if (timerIDRef.current) window.clearTimeout(timerIDRef.current); };
  }, [isPlaying, scheduler]);

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 flex flex-col font-sans overflow-x-hidden">
      <header className="h-16 border-b border-gray-800/50 flex items-center px-5 bg-[#0d1117]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <FlaskConical className="text-white transform -rotate-12" size={22} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-white leading-tight">Pattern Lab</h1>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">générateur midi par Guillaume Sax</p>
          </div>
        </div>
        <div className="ml-auto">
           <div className={`flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-full border ${isPlaying ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-gray-700 bg-gray-800/50 text-gray-500'}`}>
              <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-gray-600'}`}></div>
              {isPlaying ? 'LECTURE' : 'STOP'}
           </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-y-auto pb-10">
        <div className="px-4 pt-6 pb-2">
          <div className="bg-[#161b22] p-6 rounded-2xl border border-gray-800/50 shadow-2xl">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-8">
                <button 
                  onClick={togglePlay}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${isPlaying ? 'bg-red-600 shadow-red-600/30' : 'bg-cyan-500 shadow-cyan-500/30'} active:scale-90`}
                >
                  {isPlaying ? <Square fill="white" size={22} className="text-white"/> : <Play fill="white" className="ml-1 text-white" size={26}/>}
                </button>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-4xl font-bold text-white tracking-tight">{tempo}</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">BPM</span>
                  </div>
                  <Slider value={tempo} min={60} max={180} onChange={setTempo} />
                </div>
              </div>
              
              <Button 
                variant="secondary" 
                className="w-full bg-[#1a212c] text-white py-3.5 border border-gray-700/30 hover:border-cyan-500/30 transition-colors" 
                icon={Download}
                onClick={handleExportMidi}
              >
                Exporter en MIDI
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 mt-6 space-y-4">
          <div className="flex bg-[#161b22] p-1.5 rounded-xl border border-gray-800/50">
            {[
              { id: 'drums', label: 'Batterie', icon: Volume2, color: 'text-cyan-400' },
              { id: 'chords', label: 'Accords', icon: ListMusic, color: 'text-emerald-400' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${activeTab === tab.id ? 'bg-[#21262d] text-cyan-400 border border-gray-700/50 shadow' : 'text-gray-500'}`}
              >
                <tab.icon size={16} /> {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'drums' && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <Select 
                label="Nombre de mesures batterie" 
                value={drumBars} 
                options={[1, 2, 4]} 
                onChange={(v:any) => setDrumBars(Number(v))} 
                className="mb-0"
              />
            </div>
          )}

          {activeTab === 'chords' && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4 bg-[#161b22]/50 p-4 rounded-xl border border-gray-800/30">
              <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Ajouter un accord</h2>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Fondamentale" value={newChordRoot} options={NOTES_NAMES} onChange={setNewChordRoot} className="mb-0" />
                <Select label="Type" value={newChordType} options={Object.keys(CHORD_TYPES)} onChange={setNewChordType} className="mb-0" />
              </div>
              <Button 
                onClick={() => setChordProgression([...chordProgression, { id: Date.now(), root: newChordRoot, type: newChordType, name: `${newChordRoot} ${newChordType}` }])} 
                variant="success" 
                className="w-full" 
                icon={Plus}
              >
                Ajouter à la Progression
              </Button>
            </div>
          )}
        </div>

        <div className="px-4 mt-8 flex-1">
          {activeTab === 'drums' && (
            <div className="flex flex-col h-full">
              <div className="overflow-x-auto custom-scrollbar-hide flex ml-20 lg:ml-24 mb-4 gap-2">
                {Array.from({ length: drumBars }).map((_, barIdx) => (
                  <div key={barIdx} className="relative flex-shrink-0" style={{ width: 'calc((2rem * 4) + (2.5px * 3) + 12px)' }}>
                     <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Mesure {barIdx + 1}</div>
                     <div className="h-[2px] bg-gray-800 w-full rounded-full"></div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto pb-6 custom-scrollbar space-y-4">
                {DRUM_TRACKS.map((track, trackIdx) => (
                  <div key={track.id} className="flex items-center gap-4">
                    <div className="w-16 text-[10px] font-black text-gray-400 tracking-tighter uppercase leading-none truncate opacity-80">{track.name}</div>
                    <div className="flex gap-3">
                      {Array.from({ length: drumBars * 4 }).map((_, beatIdx) => (
                        <div key={beatIdx} className="flex gap-[2.5px]">
                          {Array.from({ length: 4 }).map((_, stepOffset) => {
                            const stepIdx = beatIdx * 4 + stepOffset;
                            const isActive = drumGrid[trackIdx][stepIdx];
                            const isCurrent = isPlaying && currentStep === stepIdx;
                            const isBeatStart = stepOffset === 0;
                            const isMeasureStart = stepIdx % 16 === 0;
                            const beatBg = beatIdx % 2 === 0 ? 'bg-[#1a212c]' : 'bg-[#141a23]';
                            return (
                              <div 
                                key={stepIdx}
                                onClick={() => {
                                  const newGrid = [...drumGrid];
                                  newGrid[trackIdx] = [...newGrid[trackIdx]];
                                  newGrid[trackIdx][stepIdx] = !newGrid[trackIdx][stepIdx];
                                  setDrumGrid(newGrid);
                                }}
                                className={`h-11 w-8 lg:w-10 rounded-md cursor-pointer transition-all flex items-center justify-center ${isActive ? track.color + ' shadow-lg border-transparent' : beatBg + ' border border-gray-800/50'} ${isCurrent ? 'ring-2 ring-white scale-105 z-10 brightness-125' : ''} ${!isActive && isBeatStart ? 'border-gray-600/50' : ''}`}
                              >
                                {!isActive && isBeatStart && <div className={`w-1 h-1 rounded-full ${isMeasureStart ? 'bg-gray-400' : 'bg-gray-700'}`}></div>}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === 'chords' && (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="bg-[#161b22] p-4 rounded-2xl border border-gray-800/50 overflow-x-auto custom-scrollbar-hide mb-6 min-h-[160px]">
                <div className="flex gap-4 min-w-max">
                  {chordProgression.length === 0 ? (
                    <div className="text-gray-600 italic text-xs py-10 w-full text-center">Ajoutez un accord</div>
                  ) : (
                    chordProgression.map((chord, idx) => (
                      <div key={chord.id} className="relative group">
                        <div className={`w-32 h-32 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${isPlaying && Math.floor(currentStep / 16) % chordProgression.length === idx ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/20 scale-105' : 'border-gray-800 bg-[#1a212c]'}`}>
                          <span className="text-2xl font-black text-white">{chord.root}</span>
                          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{chord.type}</span>
                        </div>
                        <button onClick={() => setChordProgression(chordProgression.filter(c => c.id !== chord.id))} className="absolute -top-2 -right-2 w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={14} /></button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 mt-8 space-y-8">
          {activeTab === 'drums' && (
            <div className="pt-6 border-t border-gray-800/50">
              <h2 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-4">Actions Batterie</h2>
              <Button variant="danger" className="w-full mt-2" icon={Trash2} onClick={() => setDrumGrid(DRUM_TRACKS.map(() => Array(drumBars * 16).fill(false)))}>Réinitialiser la Grille</Button>
            </div>
          )}

          {activeTab === 'chords' && (
            <div className="pt-6 border-t border-gray-800/50">
              <h2 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-4">Actions Accords</h2>
              <Button variant="danger" className="w-full" icon={Trash2} onClick={() => setChordProgression([])}>Effacer toute la progression</Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
