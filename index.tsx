import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Play, Square, Download, RefreshCw, 
  Music, Grid3X3, Sliders, Volume2, Trash2, Plus, X, ListMusic, ChevronDown,
  FlaskConical
} from 'lucide-react';

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

const SCALES: Record<string, number[]> = {
  'Majeur': [0, 2, 4, 5, 7, 9, 11],
  'Mineur': [0, 2, 3, 5, 7, 8, 10],
  'Dorien': [0, 2, 3, 5, 7, 9, 10],
  'Phrygien': [0, 1, 3, 5, 7, 8, 10],
  'Lydien': [0, 2, 4, 6, 7, 9, 11],
  'Mixolydien': [0, 2, 4, 5, 7, 9, 10],
};

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
    } else if (instr === 'bass') {
      osc.type = 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(400, time);
      osc.connect(filter); filter.connect(gain);
    } else if (instr === 'lead') {
      osc.type = 'square';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 1500;
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

const Select = ({ label, value, options, onChange }: any) => (
  <div className="mb-4 w-full">
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
  const [activeTab, setActiveTab] = useState<'drums' | 'pattern' | 'chords'>('drums');
  
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

  // Motifs
  const [style, setStyle] = useState('Lo-Fi');
  const [instrument, setInstrument] = useState('Basse');
  const [keyRoot, setKeyRoot] = useState('C');
  const [lengthBars, setLengthBars] = useState(1);
  const [density, setDensity] = useState(50);
  const [generatedNotes, setGeneratedNotes] = useState<Note[]>([]);

  const [currentStep, setCurrentStep] = useState(0);
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const timerIDRef = useRef<number | null>(null);

  const tempoRef = useRef(tempo);
  const activeTabRef = useRef(activeTab);
  const chordProgressionRef = useRef(chordProgression);
  const drumGridRef = useRef(drumGrid);
  const drumBarsRef = useRef(drumBars);
  const generatedNotesRef = useRef(generatedNotes);
  const lengthBarsRef = useRef(lengthBars);
  const instrumentRef = useRef(instrument);

  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { chordProgressionRef.current = chordProgression; }, [chordProgression]);
  useEffect(() => { drumGridRef.current = drumGrid; }, [drumGrid]);
  useEffect(() => { drumBarsRef.current = drumBars; }, [drumBars]);
  useEffect(() => { generatedNotesRef.current = generatedNotes; }, [generatedNotes]);
  useEffect(() => { lengthBarsRef.current = lengthBars; }, [lengthBars]);
  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);

  useEffect(() => {
    const targetSteps = drumBars * 16;
    setDrumGrid(prev => DRUM_TRACKS.map((_, i) => {
      const oldRow = prev[i] || [];
      const newRow = Array(targetSteps).fill(false);
      for (let j = 0; j < Math.min(oldRow.length, targetSteps); j++) newRow[j] = oldRow[j];
      return newRow;
    }));
  }, [drumBars]);

  const generatePatternLogic = useCallback(() => {
    const notes: Note[] = [];
    const rootBase = NOTES_NAMES.indexOf(keyRoot);
    const rootNote = rootBase + (instrument === 'Basse' ? 36 : 60);
    const scaleName = style === 'Pop' ? 'Majeur' : style === 'Jazz' ? 'Dorien' : style === 'Funk' ? 'Mixolydien' : 'Mineur';
    const scaleIntervals = SCALES[scaleName] || SCALES['Mineur'];
    
    const getPitch = (degree: number) => {
      const oct = Math.floor(degree / 7);
      const idx = ((degree % 7) + 7) % 7;
      return rootNote + (oct * 12) + scaleIntervals[idx];
    };

    const totalSteps = lengthBars * 16;
    if (instrument === 'Basse') {
      for (let i = 0; i < totalSteps; i++) {
        if (i % 8 === 0 || (i % 8 === 6 && Math.random() > 0.5) || Math.random() * 100 < density * 0.2) {
          notes.push({ pitch: getPitch(0), startTime: i, duration: 2, velocity: 100 });
        }
      }
    } else {
      let curDegree = 0;
      for (let i = 0; i < totalSteps; i += 2) {
        if (Math.random() * 100 < density) {
          curDegree += Math.floor(Math.random() * 3) - 1;
          notes.push({ pitch: getPitch(curDegree), startTime: i, duration: 2, velocity: 90 });
        }
      }
    }
    setGeneratedNotes(notes);
  }, [style, instrument, keyRoot, lengthBars, density]);

  const togglePlay = async () => {
    if (!isPlaying) {
      if (!audio.ctx) audio.init();
      await audio.resume();
      setIsPlaying(true);
    } else setIsPlaying(false);
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
      } else if (activeTabRef.current === 'pattern') {
        const notesToPlay = generatedNotesRef.current.filter(n => n.startTime === step);
        const instrType = instrumentRef.current === 'Basse' ? 'bass' : 'lead';
        notesToPlay.forEach(n => {
          audio.playNote(n, nextNoteTimeRef.current, instrType, n.duration * secondsPerStep);
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
      else if (activeTabRef.current === 'pattern') maxSteps = lengthBarsRef.current * 16;
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

  useEffect(() => {
    generatePatternLogic();
  }, []);

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
            <div className="flex items-center gap-8">
              <button 
                onClick={togglePlay}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isPlaying ? 'bg-red-600 shadow-red-600/30' : 'bg-cyan-500 shadow-cyan-500/30'} active:scale-90`}
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
          </div>
        </div>

        <div className="px-4 mt-6">
          <div className="flex bg-[#161b22] p-1.5 rounded-xl border border-gray-800/50">
            {[
              { id: 'drums', label: 'Batterie', icon: Volume2, color: 'text-cyan-400' },
              { id: 'pattern', label: 'Motifs', icon: Grid3X3, color: 'text-indigo-400' },
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

          {activeTab === 'pattern' && (
            <div className="flex flex-col h-full gap-4">
              <div className="h-48 bg-[#161b22] rounded-2xl border border-gray-800/50 relative overflow-hidden shadow-inner">
                {isPlaying && (
                  <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 transition-all duration-75" 
                       style={{ left: `${(currentStep / (lengthBars * 16)) * 100}%` }} />
                )}
                <div className="absolute inset-0 m-4">
                  {generatedNotes.map((note, idx) => {
                    const minP = Math.min(...generatedNotes.map(n => n.pitch)) - 2;
                    const maxP = Math.max(...generatedNotes.map(n => n.pitch)) + 2;
                    const pRange = (maxP - minP) || 12;
                    const top = 100 - ((note.pitch - minP) / pRange) * 100;
                    const left = (note.startTime / (lengthBars * 16)) * 100;
                    const width = (note.duration / (lengthBars * 16)) * 100;
                    return <div key={idx} className="absolute h-2 lg:h-3 rounded-sm bg-indigo-500 border border-indigo-300/50" style={{ top: `${top}%`, left: `${left}%`, width: `${width}%` }} />;
                  })}
                </div>
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
              <h2 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-4">Options Batterie</h2>
              <Select label="Mesures" value={drumBars} options={[1, 2, 4]} onChange={(v:any) => setDrumBars(Number(v))} />
              <Button variant="danger" className="w-full mt-2" icon={Trash2} onClick={() => setDrumGrid(DRUM_TRACKS.map(() => Array(drumBars * 16).fill(false)))}>Réinitialiser</Button>
            </div>
          )}

          {activeTab === 'pattern' && (
            <div className="pt-6 border-t border-gray-800/50 space-y-4">
              <h2 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-4">Paramètres Motifs</h2>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Style" value={style} options={['Lo-Fi', 'Jazz', 'Pop', 'Funk']} onChange={setStyle} />
                <Select label="Instrument" value={instrument} options={['Basse', 'Lead / Mélodie']} onChange={setInstrument} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Tonalité" value={keyRoot} options={NOTES_NAMES} onChange={setKeyRoot} />
                <Select label="Mesures" value={lengthBars} options={[1, 2, 4]} onChange={(v:any) => setLengthBars(Number(v))} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-gray-500">Densité: {density}%</label>
                <Slider value={density} min={10} max={100} onChange={setDensity} />
              </div>
              <Button onClick={generatePatternLogic} variant="accent" className="w-full" icon={RefreshCw}>Régénérer le Motif</Button>
            </div>
          )}

          {activeTab === 'chords' && (
            <div className="pt-6 border-t border-gray-800/50">
              <h2 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-4">Ajouter un accord</h2>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Fondamentale" value={newChordRoot} options={NOTES_NAMES} onChange={setNewChordRoot} />
                <Select label="Type" value={newChordType} options={Object.keys(CHORD_TYPES)} onChange={setNewChordType} />
              </div>
              <Button onClick={() => setChordProgression([...chordProgression, { id: Date.now(), root: newChordRoot, type: newChordType, name: `${newChordRoot} ${newChordType}` }])} variant="success" className="w-full mt-2" icon={Plus}>Ajouter</Button>
            </div>
          )}

          <div className="pt-4">
            <Button variant="secondary" className="w-full bg-[#1a212c] text-white py-4" icon={Download}>Exporter en MIDI</Button>
          </div>
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