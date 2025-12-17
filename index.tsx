import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Play, Square, Download, RefreshCw, 
  Music, Grid3X3, Sliders, Volume2, Trash2, Plus, X, ListMusic
} from 'lucide-react';

/**
 * ==========================================
 * UTILITAIRES : TYPES & CONSTANTES
 * ==========================================
 */

type Note = {
  pitch: number;      // Note MIDI
  startTime: number;  // En double-croches (steps)
  duration: number;   // En double-croches
  velocity: number;   // 0-127
};

type DrumTrack = {
  id: number;
  name: string;       // Nom affiché (FR)
  audioKey: string;   // Clé interne pour le moteur audio
  midiNote: number;
  color: string;
};

type ChordItem = {
  id: number;
  root: string;
  type: string;
  name: string; // ex: "C Maj7"
};

const STEPS_PER_BAR = 16;
const DEFAULT_BARS = 4;

const DRUM_TRACKS: DrumTrack[] = [
  { id: 0, name: 'Kick', audioKey: 'Kick', midiNote: 36, color: 'bg-orange-500' },
  { id: 1, name: 'Snare', audioKey: 'Snare', midiNote: 38, color: 'bg-cyan-500' },
  { id: 2, name: 'Hats Fermé', audioKey: 'Hi-Hat Closed', midiNote: 42, color: 'bg-yellow-400' },
  { id: 3, name: 'Hats Ouvert', audioKey: 'Hi-Hat Open', midiNote: 46, color: 'bg-yellow-200' },
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
  'Majeur': [0, 4, 7],
  'Mineur': [0, 3, 7],
  '7': [0, 4, 7, 10],
  'Maj7': [0, 4, 7, 11],
  'm7': [0, 3, 7, 10],
  'dim': [0, 3, 6],
  'aug': [0, 4, 8],
  'sus4': [0, 5, 7],
  'sus2': [0, 2, 7]
};

const NOTES_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

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
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
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
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.5);
    } else if (trackKey === 'Snare') {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 1000;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(1, time);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(time);
      noise.stop(time + 0.2);

      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, time);
      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.5, time);
      oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.2);
    } else if (trackKey.includes('Hi-Hat')) {
      const open = trackKey.includes('Open');
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 8000;
      const gain = this.ctx.createGain();
      const duration = open ? 0.3 : 0.05;
      gain.gain.setValueAtTime(0.6, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(time);
      noise.stop(time + duration);
    }
  }

  playNote(note: Note, time: number, instrumentType: 'bass' | 'lead' | 'piano' | 'pad', durationSeconds: number) {
    if (!this.ctx || !this.masterGain) return;
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(freq, time);
    if (instrumentType === 'bass') {
      osc.type = 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, time);
      filter.frequency.exponentialRampToValueAtTime(100, time + durationSeconds);
      osc.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.4, time + 0.02);
      gain.gain.setTargetAtTime(0, time + durationSeconds * 0.9, 0.1);
    } else if (instrumentType === 'lead') {
      osc.type = 'square';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2000;
      osc.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.3, time + 0.02);
      gain.gain.setTargetAtTime(0, time + durationSeconds * 0.9, 0.1);
    } else if (instrumentType === 'pad') {
      osc.type = 'triangle';
      osc.connect(gain);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.2, time + 0.1);
      gain.gain.setValueAtTime(0.2, time + durationSeconds - 0.1);
      gain.gain.linearRampToValueAtTime(0, time + durationSeconds + 0.2);
    } else {
      osc.type = 'triangle';
      osc.connect(gain);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.3, time + 0.02);
      gain.gain.setTargetAtTime(0, time + durationSeconds * 0.9, 0.1);
    }
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + durationSeconds + 0.5);
  }
}

const audio = new AudioEngine();

/**
 * ==========================================
 * LOGIQUE D'EXPORT MIDI
 * ==========================================
 */
class SimpleMidiWriter {
  data: number[] = [];
  trackData: number[] = [];

  writeString(str: string) {
    for (let i = 0; i < str.length; i++) this.data.push(str.charCodeAt(i));
  }
  writeInt32(val: number) {
    this.data.push((val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff);
  }
  writeInt16(val: number) {
    this.data.push((val >> 8) & 0xff, val & 0xff);
  }
  writeVLQ(track: number[], val: number) {
    let buffer = val & 0x7f;
    while ((val >>= 7)) {
      buffer <<= 8;
      buffer |= (val & 0x7f) | 0x80;
    }
    while (true) {
      track.push(buffer & 0xff);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
  }

  createMidiFile(notes: { pitch: number; startTick: number; durationTicks: number; channel: number }[]) {
    this.data = [];
    this.trackData = [];
    this.writeString('MThd');
    this.writeInt32(6); 
    this.writeInt16(1); 
    this.writeInt16(1); 
    this.writeInt16(480); 
    type MidiEvent = { tick: number; type: 'on' | 'off'; pitch: number; channel: number };
    const events: MidiEvent[] = [];
    notes.forEach(n => {
      events.push({ tick: n.startTick, type: 'on', pitch: n.pitch, channel: n.channel });
      events.push({ tick: n.startTick + n.durationTicks, type: 'off', pitch: n.pitch, channel: n.channel });
    });
    events.sort((a, b) => a.tick - b.tick);
    let lastTick = 0;
    events.forEach(e => {
      const delta = e.tick - lastTick;
      this.writeVLQ(this.trackData, delta);
      const status = (e.type === 'on' ? 0x90 : 0x80) | e.channel;
      this.trackData.push(status, e.pitch, e.type === 'on' ? 100 : 0); 
      lastTick = e.tick;
    });
    this.writeVLQ(this.trackData, 0);
    this.trackData.push(0xff, 0x2f, 0x00);
    this.writeString('MTrk');
    this.writeInt32(this.trackData.length);
    this.data.push(...this.trackData);
    return new Uint8Array(this.data);
  }
}

/**
 * ==========================================
 * COMPOSANTS
 * ==========================================
 */

const Slider = ({ label, value, min, max, onChange, unit = '' }: any) => (
  <div className="mb-4">
    <div className="flex justify-between text-xs text-gray-400 mb-1">
      <span>{label}</span>
      <span>{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
    />
  </div>
);

const Select = ({ label, value, options, onChange }: any) => (
  <div className="mb-4">
    <label className="block text-xs text-gray-400 mb-1">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-800 text-gray-200 text-sm border border-gray-700 rounded p-2 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
    >
      {options.map((opt: any) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

const Button = ({ children, onClick, variant = 'primary', className = '', icon: Icon }: any) => {
  const baseStyle = "flex items-center justify-center px-4 py-2 rounded font-medium transition-all text-sm shadow-md active:scale-95";
  const variants: Record<string, string> = {
    primary: "bg-cyan-600 hover:bg-cyan-500 text-white",
    secondary: "bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600",
    danger: "bg-red-900/50 hover:bg-red-800/50 text-red-200 border border-red-900",
    accent: "bg-indigo-600 hover:bg-indigo-500 text-white",
    success: "bg-emerald-600 hover:bg-emerald-500 text-white"
  };
  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`}>
      {Icon && <Icon size={16} className="mr-2" />}
      {children}
    </button>
  );
};

// --- Algorithme de génération Melodique ---
const generatePatternLogic = (style: string, instrument: string, rootKey: string, lengthBars: number, density: number): Note[] => {
  const notes: Note[] = [];
  const rootNote = NOTES_NAMES.indexOf(rootKey) + (instrument === 'Basse' ? 36 : 60);
  let scaleName = 'Mineur';
  if (style === 'Pop') scaleName = 'Majeur';
  if (style === 'Jazz') scaleName = 'Dorien';
  if (style === 'Funk') scaleName = 'Mixolydien';
  const scaleIntervals = SCALES[scaleName] || SCALES['Mineur'];
  const getPitch = (degree: number, octaveOffset = 0) => {
    const oct = Math.floor(degree / 7) + octaveOffset;
    const idx = degree % 7;
    return rootNote + (oct * 12) + scaleIntervals[idx];
  };
  const totalSteps = lengthBars * 16;
  if (instrument === 'Basse') {
    for (let i = 0; i < totalSteps; i++) {
      let play = false;
      let pitch = getPitch(0);
      if (i % 16 === 0) play = true;
      else if (i % 16 === 8 && Math.random() > 0.2) play = true;
      else if (Math.random() * 100 < density * 0.5) {
        play = true;
        pitch = getPitch([0, 2, 4, 6, 7][Math.floor(Math.random() * 5)]);
      }
      if (play) notes.push({ pitch, startTime: i, duration: 2 + Math.floor(Math.random() * 2), velocity: 100 });
    }
  } else if (instrument === 'Piano / Accords') {
    for (let i = 0; i < totalSteps; i += 8) {
      if (Math.random() * 100 < density) {
        const rootOffset = Math.floor(Math.random() * 4); 
        notes.push({ pitch: getPitch(rootOffset), startTime: i, duration: 8, velocity: 90 });
        notes.push({ pitch: getPitch(rootOffset + 2), startTime: i, duration: 8, velocity: 90 });
        notes.push({ pitch: getPitch(rootOffset + 4), startTime: i, duration: 8, velocity: 90 });
      }
    }
  } else {
    let currentDegree = 0;
    for (let i = 0; i < totalSteps; i += 2) {
      if (Math.random() * 100 < density) {
        currentDegree += Math.floor(Math.random() * 5) - 2;
        notes.push({ pitch: getPitch(Math.abs(currentDegree % 14)), startTime: i, duration: 2, velocity: 100 });
      }
    }
  }
  return notes;
};

// --- Composant Principal ---

const App = () => {
  const [tempo, setTempo] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'drums' | 'pattern' | 'chords'>('drums');
  
  // Batterie
  const [drumBars, setDrumBars] = useState(4);
  const [drumGrid, setDrumGrid] = useState<boolean[][]>(
    DRUM_TRACKS.map(() => Array(DEFAULT_BARS * 16).fill(false))
  );

  useEffect(() => {
    const targetSteps = drumBars * 16;
    setDrumGrid(prev => DRUM_TRACKS.map((_, i) => {
      const oldRow = prev[i] || [];
      const newRow = Array(targetSteps).fill(false);
      for (let j = 0; j < Math.min(oldRow.length, targetSteps); j++) {
        newRow[j] = oldRow[j];
      }
      return newRow;
    }));
  }, [drumBars]);
  
  // Pattern
  const [style, setStyle] = useState('Lo-Fi');
  const [instrument, setInstrument] = useState('Basse');
  const [keyRoot, setKeyRoot] = useState('C');
  const [lengthBars, setLengthBars] = useState(4);
  const [density, setDensity] = useState(50);
  const [generatedNotes, setGeneratedNotes] = useState<Note[]>([]);

  // Accords
  const [chordProgression, setChordProgression] = useState<ChordItem[]>([]);
  const [newChordRoot, setNewChordRoot] = useState('C');
  const [newChordType, setNewChordType] = useState('Majeur');

  // Lecture
  const [currentStep, setCurrentStep] = useState(0); 
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const timerIDRef = useRef<number | null>(null);

  const drumGridRef = useRef(drumGrid);
  const generatedNotesRef = useRef(generatedNotes);
  const chordProgressionRef = useRef(chordProgression);
  const activeTabRef = useRef(activeTab);
  const tempoRef = useRef(tempo);
  const instrumentRef = useRef(instrument);
  const lengthBarsRef = useRef(lengthBars);
  const drumBarsRef = useRef(drumBars);

  useEffect(() => { drumGridRef.current = drumGrid; }, [drumGrid]);
  useEffect(() => { generatedNotesRef.current = generatedNotes; }, [generatedNotes]);
  useEffect(() => { chordProgressionRef.current = chordProgression; }, [chordProgression]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);
  useEffect(() => { lengthBarsRef.current = lengthBars; }, [lengthBars]);
  useEffect(() => { drumBarsRef.current = drumBars; }, [drumBars]);

  useEffect(() => {
    handleGeneratePattern();
    setChordProgression([
      { id: 1, root: 'C', type: 'm7', name: 'C m7' },
      { id: 2, root: 'F', type: 'Majeur', name: 'F Majeur' },
      { id: 3, root: 'G', type: '7', name: 'G 7' },
      { id: 4, root: 'C', type: 'm7', name: 'C m7' },
    ]);
  }, []);

  const togglePlay = async () => {
    if (!isPlaying) {
      if (!audio.ctx) audio.init();
      if (audio.ctx?.state === 'suspended') await audio.ctx.resume();
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  const scheduleNote = useCallback((stepNumber: number, time: number) => {
    requestAnimationFrame(() => setCurrentStep(stepNumber));
    const secPerBeat = 60 / tempoRef.current;
    const secPerStep = secPerBeat / 4;

    if (activeTabRef.current === 'drums') {
      DRUM_TRACKS.forEach((track, index) => {
        if (drumGridRef.current[index][stepNumber]) {
          audio.playDrum(track.audioKey, time);
        }
      });
    } else if (activeTabRef.current === 'pattern') {
      const patternLengthSteps = lengthBarsRef.current * 16;
      const loopStep = stepNumber % patternLengthSteps;
      const notes = generatedNotesRef.current;
      const notesToPlay = notes.filter(n => n.startTime === loopStep);
      notesToPlay.forEach(note => {
        let instr: 'bass'|'lead'|'piano'|'pad' = 'piano';
        if (instrumentRef.current === 'Basse') instr = 'bass';
        else if (instrumentRef.current.includes('Lead')) instr = 'lead';
        audio.playNote(note, time, instr, note.duration * secPerStep);
      });
    } else if (activeTabRef.current === 'chords') {
      if (chordProgressionRef.current.length === 0) return;
      if (stepNumber % 16 === 0) {
        const barIndex = Math.floor(stepNumber / 16);
        const chord = chordProgressionRef.current[barIndex % chordProgressionRef.current.length];
        if (chord) {
          const rootIndex = NOTES_NAMES.indexOf(chord.root);
          const basePitch = 60 + rootIndex;
          const intervals = CHORD_TYPES[chord.type];
          intervals.forEach(interval => {
            audio.playNote({ pitch: basePitch + interval, startTime: 0, duration: 16, velocity: 80 }, time, 'pad', 4 * secPerBeat);
          });
        }
      }
    }
  }, []);

  const scheduler = useCallback(() => {
    if (!audio.ctx) return;
    const tempoVal = tempoRef.current;
    const secondsPerStep = (60.0 / tempoVal) / 4; 
    const scheduleAheadTime = 0.1; 
    const lookahead = 25.0; 
    while (nextNoteTimeRef.current < audio.ctx.currentTime + scheduleAheadTime) {
      scheduleNote(stepRef.current, nextNoteTimeRef.current);
      nextNoteTimeRef.current += secondsPerStep;
      let maxSteps = 16;
      if (activeTabRef.current === 'drums') maxSteps = drumBarsRef.current * 16;
      else if (activeTabRef.current === 'pattern') maxSteps = lengthBarsRef.current * 16;
      else if (activeTabRef.current === 'chords') maxSteps = chordProgressionRef.current.length * 16;
      stepRef.current = (stepRef.current + 1) % (maxSteps || 16); 
    }
    timerIDRef.current = window.setTimeout(scheduler, lookahead);
  }, [scheduleNote]);

  useEffect(() => {
    if (isPlaying) {
      if (!audio.ctx) audio.init();
      nextNoteTimeRef.current = audio.ctx!.currentTime + 0.05;
      stepRef.current = 0;
      setCurrentStep(0);
      scheduler();
    }
    return () => { if (timerIDRef.current) window.clearTimeout(timerIDRef.current); };
  }, [isPlaying, scheduler]);

  const handleToggleStep = (trackIdx: number, stepIdx: number) => {
    const newGrid = [...drumGrid];
    newGrid[trackIdx] = [...newGrid[trackIdx]];
    newGrid[trackIdx][stepIdx] = !newGrid[trackIdx][stepIdx];
    setDrumGrid(newGrid);
  };

  const handleClearDrum = () => {
    setDrumGrid(DRUM_TRACKS.map(() => Array(drumBars * 16).fill(false)));
  };

  const handleGeneratePattern = () => {
    setGeneratedNotes(generatePatternLogic(style, instrument, keyRoot, lengthBars, density));
  };

  const handleAddChord = () => {
    setChordProgression([...chordProgression, { id: Date.now(), root: newChordRoot, type: newChordType, name: `${newChordRoot} ${newChordType}` }]);
  };

  const handleRemoveChord = (id: number) => {
    setChordProgression(chordProgression.filter(c => c.id !== id));
  };

  const handleExportMidi = () => {
    const writer = new SimpleMidiWriter();
    let midiBytes: Uint8Array;
    let fileName = 'pattern.mid';

    if (activeTab === 'drums') {
      const notes: any[] = [];
      drumGrid.forEach((row, trackIdx) => {
        row.forEach((active, step) => {
          if (active) notes.push({ pitch: DRUM_TRACKS[trackIdx].midiNote, startTick: step * 120, durationTicks: 60, channel: 9 });
        });
      });
      midiBytes = writer.createMidiFile(notes);
      fileName = 'batterie.mid';
    } else if (activeTab === 'pattern') {
      midiBytes = writer.createMidiFile(generatedNotes.map(n => ({ pitch: n.pitch, startTick: n.startTime * 120, durationTicks: n.duration * 120, channel: 0 })));
      fileName = `${style.toLowerCase()}.mid`;
    } else if (activeTab === 'chords') {
      const notes: any[] = [];
      chordProgression.forEach((chord, index) => {
        const rootIndex = NOTES_NAMES.indexOf(chord.root);
        const intervals = CHORD_TYPES[chord.type];
        intervals.forEach(interval => notes.push({ pitch: 60 + rootIndex + interval, startTick: index * 16 * 120, durationTicks: 16 * 120, channel: 0 }));
      });
      midiBytes = writer.createMidiFile(notes);
      fileName = 'accords.mid';
    }
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-gray-200 flex flex-col font-sans selection:bg-cyan-500/30">
      <header className="h-16 border-b border-gray-800 flex items-center px-4 lg:px-6 bg-neutral-900/90 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-2 lg:gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Music className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-base lg:text-lg font-bold tracking-tight text-white leading-none">Pattern Lab</h1>
            <p className="text-[10px] text-gray-500 font-mono">Générateur MIDI</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 lg:gap-4">
           <div className={`flex items-center gap-2 text-[10px] lg:text-xs font-mono px-2 lg:px-3 py-1 rounded-full border ${isPlaying ? 'border-green-900 bg-green-900/20 text-green-400' : 'border-gray-800 bg-gray-800 text-gray-500'}`}>
              <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
              {isPlaying ? 'LECTURE' : 'STOP'}
           </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* TRANSPORT & OPTIONS (ORDER 1 ON MOBILE) */}
        <aside className="w-full lg:w-72 bg-neutral-900 border-r border-gray-800 p-4 lg:p-6 flex flex-col overflow-y-auto order-1 lg:order-1">
          <div className="mb-4 lg:mb-8">
            <div className="bg-gray-800/50 p-3 lg:p-4 rounded-xl border border-gray-700/50 flex lg:block items-center gap-4">
              <button 
                onClick={togglePlay}
                className={`w-12 h-12 lg:w-16 lg:h-16 rounded-full flex items-center justify-center transition-all shadow-xl flex-shrink-0 ${isPlaying ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' : 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-cyan-500/20'}`}
              >
                {isPlaying ? <Square fill="currentColor" size={20}/> : <Play fill="currentColor" className="ml-1" size={24}/>}
              </button>
              <div className="flex-1 lg:mt-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xl lg:text-3xl font-mono font-bold text-gray-100 leading-none">{tempo}</div>
                  <div className="text-[10px] text-gray-500 uppercase">BPM</div>
                </div>
                <Slider value={tempo} min={60} max={180} onChange={setTempo} />
              </div>
            </div>
          </div>

          <div className="hidden lg:flex flex-1 flex-col space-y-4">
            {activeTab === 'drums' && (
              <div className="space-y-4">
                <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 flex items-center">
                  <Music size={14} className="mr-2"/> Options Batterie
                </h2>
                <Select label="Nombre de Mesures" value={drumBars} options={[1, 2, 4, 8]} onChange={(v:string) => setDrumBars(Number(v))} />
                <Button variant="danger" className="w-full text-xs" icon={Trash2} onClick={handleClearDrum}>Réinitialiser</Button>
              </div>
            )}
            {activeTab === 'pattern' && (
              <div className="space-y-3">
                <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 flex items-center">
                  <Grid3X3 size={14} className="mr-2"/> Paramètres
                </h2>
                <Select label="Style" value={style} options={['Lo-Fi', 'Jazz', 'Pop', 'Funk']} onChange={setStyle} />
                <Select label="Instrument" value={instrument} options={['Basse', 'Piano / Accords', 'Lead / Mélodie']} onChange={setInstrument} />
                <div className="grid grid-cols-2 gap-2">
                  <Select label="Clé" value={keyRoot} options={NOTES_NAMES} onChange={setKeyRoot} />
                  <Select label="Long." value={lengthBars} options={[1, 2, 4]} onChange={(v:string) => setLengthBars(Number(v))} />
                </div>
                <Slider label="Densité" value={density} min={10} max={100} onChange={setDensity} unit="%" />
                <Button variant="accent" className="w-full" icon={RefreshCw} onClick={handleGeneratePattern}>Régénérer</Button>
              </div>
            )}
            {activeTab === 'chords' && (
              <div className="space-y-3">
                <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-2 flex items-center">
                  <Plus size={14} className="mr-2"/> Ajouter Accord
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  <Select label="Note" value={newChordRoot} options={NOTES_NAMES} onChange={setNewChordRoot} />
                  <Select label="Type" value={newChordType} options={Object.keys(CHORD_TYPES)} onChange={setNewChordType} />
                </div>
                <Button onClick={handleAddChord} variant="success" className="w-full">Ajouter</Button>
              </div>
            )}
          </div>

          <div className="hidden lg:block mt-6 pt-6 border-t border-gray-800">
             <Button onClick={handleExportMidi} variant="secondary" className="w-full" icon={Download}>Exporter MIDI</Button>
          </div>
        </aside>

        {/* WORKSPACE (ORDER 2 ON MOBILE) */}
        <section className="flex-1 flex flex-col bg-[#0a0a0a] overflow-hidden order-2 lg:order-2">
          <div className="flex border-b border-gray-800 px-4 lg:px-6 pt-2 lg:pt-6 gap-1 overflow-x-auto bg-neutral-900 scrollbar-hide">
            {[
              { id: 'drums', label: 'Batterie', icon: Volume2, color: 'text-cyan-400' },
              { id: 'pattern', label: 'Motifs', icon: Grid3X3, color: 'text-indigo-400' },
              { id: 'chords', label: 'Accords', icon: ListMusic, color: 'text-emerald-400' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 lg:px-6 py-2 text-xs lg:text-sm font-medium rounded-t-lg transition-colors border-t border-l border-r flex-shrink-0 flex items-center gap-2 ${
                  activeTab === tab.id 
                    ? `bg-neutral-800 border-gray-700 ${tab.color}` 
                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 p-3 lg:p-6 overflow-y-auto bg-neutral-800/50 scroll-smooth">
            {activeTab === 'drums' && (
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
                  <div className="min-w-fit select-none">
                    <div className="flex ml-16 lg:ml-24 mb-2">
                       {Array.from({ length: drumBars }).map((_, barIdx) => (
                         <div key={barIdx} className="w-[164px] lg:w-[264px] border-b border-gray-700 text-[10px] text-gray-500 pb-1 font-mono pl-1 flex-shrink-0">
                           Mesure {barIdx + 1}
                         </div>
                       ))}
                    </div>
                    {DRUM_TRACKS.map((track, trackIdx) => (
                      <div key={track.id} className="flex mb-2 lg:mb-3">
                        <div className="w-16 lg:w-24 flex-shrink-0 flex items-center text-[10px] font-bold text-gray-400 uppercase tracking-wider pr-2">
                          {track.name}
                        </div>
                        <div className="flex-1 flex gap-[1px] lg:gap-[2px]">
                          {drumGrid[trackIdx]?.map((isActive, stepIdx) => {
                             const beatIdx = Math.floor(stepIdx / 4);
                             const isCurrent = isPlaying && currentStep === stepIdx;
                             // Couleur de fond alternée par temps pour aider à identifier chaque temps
                             const beatBg = beatIdx % 2 === 0 ? 'bg-neutral-700/50' : 'bg-neutral-800/80';
                             
                             return (
                               <div 
                                 key={stepIdx}
                                 onClick={() => handleToggleStep(trackIdx, stepIdx)}
                                 className={`
                                   h-10 lg:h-12 w-10 lg:w-16 rounded-sm cursor-pointer transition-all duration-75 relative flex-shrink-0
                                   ${stepIdx % 4 === 0 && stepIdx !== 0 ? 'ml-1' : ''}
                                   ${stepIdx % 16 === 0 && stepIdx !== 0 ? 'ml-2' : ''}
                                   ${isActive ? track.color : beatBg + ' hover:bg-gray-600'}
                                   ${isCurrent ? 'brightness-150 ring-2 ring-white z-10 scale-105' : ''}
                                   ${!isActive && stepIdx % 4 === 0 ? 'brightness-125 border-l border-white/5' : ''}
                                 `}
                               />
                             );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'pattern' && (
              <div className="h-full flex flex-col">
                <div className="flex-1 bg-black/40 rounded-lg border border-gray-700 relative overflow-hidden shadow-inner min-h-[250px]">
                  <div className="absolute inset-0 pointer-events-none opacity-20" 
                    style={{ backgroundImage: 'linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)', backgroundSize: `${100 / (lengthBars * 4)}% 20px` }}
                  />
                  {isPlaying && (
                    <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 transition-all duration-75" style={{ left: `${(currentStep / (lengthBars * 16)) * 100}%` }} />
                  )}
                  <div className="absolute inset-0 m-4">
                    {generatedNotes.map((note, idx) => {
                      const minPitch = Math.min(...generatedNotes.map(n => n.pitch)) - 2;
                      const maxPitch = Math.max(...generatedNotes.map(n => n.pitch)) + 2;
                      const pitchRange = maxPitch - minPitch || 12;
                      const topPct = 100 - ((note.pitch - minPitch) / pitchRange) * 100;
                      const leftPct = (note.startTime / (lengthBars * 16)) * 100;
                      const widthPct = (note.duration / (lengthBars * 16)) * 100;
                      return <div key={idx} className="absolute h-3 rounded-sm bg-indigo-500 border border-indigo-300/50" style={{ top: `${topPct}%`, left: `${leftPct}%`, width: `${widthPct}%` }} />;
                    })}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'chords' && (
              <div className="h-full flex flex-col">
                <div className="flex-1 bg-neutral-900/50 rounded-lg border border-gray-800 overflow-x-auto p-4 lg:p-8 custom-scrollbar min-h-[200px]">
                   {chordProgression.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-600 italic text-sm">Aucun accord ajouté.</div>
                   ) : (
                     <div className="flex gap-2 relative min-w-max">
                        {isPlaying && (
                          <div className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10" style={{ left: `${(currentStep / (chordProgression.length * 16)) * (chordProgression.length * 136)}px` }} />
                        )}
                        {chordProgression.map((chord, idx) => (
                          <div key={chord.id} className="relative group">
                            <div className={`w-32 lg:w-40 h-28 lg:h-32 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${isPlaying && Math.floor(currentStep / 16) === idx ? 'border-emerald-400 bg-emerald-900/20' : 'border-gray-700 bg-gray-800'}`}>
                              <span className="text-xl lg:text-2xl font-bold text-gray-200">{chord.root}</span>
                              <span className="text-[10px] lg:text-sm text-gray-400 font-mono">{chord.type}</span>
                            </div>
                            <button onClick={() => handleRemoveChord(chord.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-900 text-red-200 rounded-full flex items-center justify-center lg:opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"><X size={12} /></button>
                          </div>
                        ))}
                     </div>
                   )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* OPTIONS & EXPORT (ORDER 3 & 4 ON MOBILE) */}
        <aside className="lg:hidden w-full bg-neutral-900 border-t border-gray-800 p-4 flex flex-col gap-4 order-3 overflow-y-auto max-h-[40vh]">
            <div className="flex flex-col space-y-4">
              {activeTab === 'drums' && (
                <div className="space-y-3">
                  <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold flex items-center">
                    <Music size={14} className="mr-2"/> Options Batterie
                  </h2>
                  <Select label="Nombre de Mesures" value={drumBars} options={[1, 2, 4, 8]} onChange={(v:string) => setDrumBars(Number(v))} />
                  <Button variant="danger" className="w-full text-xs" icon={Trash2} onClick={handleClearDrum}>Réinitialiser la Grille</Button>
                </div>
              )}
              {activeTab === 'pattern' && (
                <div className="space-y-3">
                  <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold flex items-center">
                    <Grid3X3 size={14} className="mr-2"/> Paramètres Générateur
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Style" value={style} options={['Lo-Fi', 'Jazz', 'Pop', 'Funk']} onChange={setStyle} />
                    <Select label="Instrument" value={instrument} options={['Basse', 'Piano / Accords', 'Lead / Mélodie']} onChange={setInstrument} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Tonalité" value={keyRoot} options={NOTES_NAMES} onChange={setKeyRoot} />
                    <Select label="Mesures" value={lengthBars} options={[1, 2, 4]} onChange={(v:string) => setLengthBars(Number(v))} />
                  </div>
                  <Slider label="Densité" value={density} min={10} max={100} onChange={setDensity} unit="%" />
                  <Button variant="accent" className="w-full" icon={RefreshCw} onClick={handleGeneratePattern}>Régénérer le Motif</Button>
                </div>
              )}
              {activeTab === 'chords' && (
                <div className="space-y-3">
                  <h2 className="text-[10px] uppercase tracking-wider text-gray-500 font-bold flex items-center">
                    <Plus size={14} className="mr-2"/> Ajouter Accord
                  </h2>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Note" value={newChordRoot} options={NOTES_NAMES} onChange={setNewChordRoot} />
                    <Select label="Type" value={newChordType} options={Object.keys(CHORD_TYPES)} onChange={setNewChordType} />
                  </div>
                  <Button onClick={handleAddChord} variant="success" className="w-full">Ajouter à la Séquence</Button>
                </div>
              )}
            </div>
            
            <div className="pt-4 border-t border-gray-800">
               <Button onClick={handleExportMidi} variant="secondary" className="w-full" icon={Download}>Exporter en MIDI</Button>
            </div>
        </aside>
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}