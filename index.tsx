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

// 4 Pistes, 64 pas (4 mesures * 16 pas)
const STEPS_PER_BAR = 16;
const BARS = 4;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;

const DRUM_TRACKS: DrumTrack[] = [
  { id: 0, name: 'Grosse Caisse', audioKey: 'Kick', midiNote: 36, color: 'bg-orange-500' },
  { id: 1, name: 'Caisse Claire', audioKey: 'Snare', midiNote: 38, color: 'bg-cyan-500' },
  { id: 2, name: 'Charley Fermé', audioKey: 'Hi-Hat Closed', midiNote: 42, color: 'bg-yellow-400' },
  { id: 3, name: 'Charley Ouvert', audioKey: 'Hi-Hat Open', midiNote: 46, color: 'bg-yellow-200' },
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
  
  // Buffer de bruit pour Snare/Hats
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
    const bufferSize = this.ctx.sampleRate * 2; // 2 secondes
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
      // Bruit
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

      // Tonalité
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

    // Conversion MIDI pitch vers Hz
    const freq = 440 * Math.pow(2, (note.pitch - 69) / 12);
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.frequency.setValueAtTime(freq, time);

    // Synthèse simple selon l'instrument
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
      // Attaque et relâchement plus doux pour les nappes
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.2, time + 0.1); // Slow attack
      gain.gain.setValueAtTime(0.2, time + durationSeconds - 0.1);
      gain.gain.linearRampToValueAtTime(0, time + durationSeconds + 0.2); // Slow release
    } else {
      // Piano-ish (Sinus + triangle)
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
    for (let i = 0; i < str.length; i++) {
      this.data.push(str.charCodeAt(i));
    }
  }

  writeInt32(val: number) {
    this.data.push((val >> 24) & 0xff);
    this.data.push((val >> 16) & 0xff);
    this.data.push((val >> 8) & 0xff);
    this.data.push(val & 0xff);
  }

  writeInt16(val: number) {
    this.data.push((val >> 8) & 0xff);
    this.data.push(val & 0xff);
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

    // Header Chunk
    this.writeString('MThd');
    this.writeInt32(6); 
    this.writeInt16(1); 
    this.writeInt16(1); 
    this.writeInt16(480); 

    // Track Chunk
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
      this.trackData.push(status);
      this.trackData.push(e.pitch);
      this.trackData.push(e.type === 'on' ? 100 : 0); 

      lastTick = e.tick;
    });

    // Fin de piste
    this.writeVLQ(this.trackData, 0);
    this.trackData.push(0xff, 0x2f, 0x00);

    // Écriture du header de piste
    this.writeString('MTrk');
    this.writeInt32(this.trackData.length);
    this.data.push(...this.trackData);

    return new Uint8Array(this.data);
  }
}

/**
 * ==========================================
 * ALGORITHMES DE GÉNÉRATION
 * ==========================================
 */
const generatePatternLogic = (
  style: string,
  instrument: string,
  rootKey: string,
  lengthBars: number,
  density: number
): Note[] => {
  const notes: Note[] = [];
  const rootNote = NOTES_NAMES.indexOf(rootKey) + (instrument === 'Basse' ? 36 : 60); // C2 ou C4
  
  // Choix de la gamme selon le style
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

  // LOGIQUE DE GÉNÉRATION
  if (instrument === 'Basse') {
    // Basse : Toniques solides sur les temps forts
    for (let i = 0; i < totalSteps; i++) {
      let play = false;
      let pitch = getPitch(0); // Tonique

      // Toujours jouer la tonique au début de la mesure
      if (i % 16 === 0) play = true;
      // Forte chance sur le temps 3 (step 8)
      else if (i % 16 === 8 && Math.random() > 0.2) play = true;
      // Remplissage aléatoire selon la densité
      else if (Math.random() * 100 < density * 0.5) {
        play = true;
        // Utilise Tierce, Quinte, 7ème ou Octave
        const interval = [0, 2, 4, 6, 7][Math.floor(Math.random() * 5)];
        pitch = getPitch(interval); 
      }

      if (play) {
        notes.push({
          pitch,
          startTime: i,
          duration: 2 + Math.floor(Math.random() * 2), // approx 1/8ème
          velocity: 100
        });
      }
    }
  } else if (instrument === 'Piano / Accords') {
    // Accords : Nappes ou rythmiques
    for (let i = 0; i < totalSteps; i += 8) { // Vérifie tous les 2 temps
      if (Math.random() * 100 < density) {
        // Construit une triade
        const rootOffset = Math.floor(Math.random() * 4); 
        notes.push({ pitch: getPitch(rootOffset), startTime: i, duration: 8, velocity: 90 });
        notes.push({ pitch: getPitch(rootOffset + 2), startTime: i, duration: 8, velocity: 90 });
        notes.push({ pitch: getPitch(rootOffset + 4), startTime: i, duration: 8, velocity: 90 });
      }
    }
  } else {
    // Lead / Mélodie
    let currentDegree = 0;
    for (let i = 0; i < totalSteps; i += 2) { // Grille de croche
      if (Math.random() * 100 < density) {
        // Marche aléatoire
        const move = Math.floor(Math.random() * 5) - 2; // -2 à +2 degrés
        currentDegree += move;
        const pitch = getPitch(Math.abs(currentDegree % 14)); // Reste dans 2 octaves
        
        notes.push({
          pitch,
          startTime: i,
          duration: 2,
          velocity: 100
        });
      }
    }
  }

  return notes;
};


/**
 * ==========================================
 * COMPOSANTS
 * ==========================================
 */

// --- Composants de Contrôle Partagés ---

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

// --- Composant Principal ---

const App = () => {
  // État Global
  const [tempo, setTempo] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState<'drums' | 'pattern' | 'chords'>('drums');
  
  // État Batterie
  const [drumGrid, setDrumGrid] = useState<boolean[][]>(
    DRUM_TRACKS.map(() => Array(TOTAL_STEPS).fill(false))
  );
  
  // État Pattern
  const [style, setStyle] = useState('Lo-Fi');
  const [instrument, setInstrument] = useState('Basse');
  const [keyRoot, setKeyRoot] = useState('C');
  const [lengthBars, setLengthBars] = useState(4);
  const [density, setDensity] = useState(50);
  const [generatedNotes, setGeneratedNotes] = useState<Note[]>([]);

  // État Accords
  const [chordProgression, setChordProgression] = useState<ChordItem[]>([]);
  const [newChordRoot, setNewChordRoot] = useState('C');
  const [newChordType, setNewChordType] = useState('Majeur');

  // État Lecture
  const [currentStep, setCurrentStep] = useState(0); 
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0);
  const timerIDRef = useRef<number | null>(null);

  // -- Refs pour l'accès Scheduler (évite les fermetures obsolètes) --
  const drumGridRef = useRef(drumGrid);
  const generatedNotesRef = useRef(generatedNotes);
  const chordProgressionRef = useRef(chordProgression);
  const activeTabRef = useRef(activeTab);
  const tempoRef = useRef(tempo);
  const instrumentRef = useRef(instrument);
  const lengthBarsRef = useRef(lengthBars);

  // Synchro refs
  useEffect(() => { drumGridRef.current = drumGrid; }, [drumGrid]);
  useEffect(() => { generatedNotesRef.current = generatedNotes; }, [generatedNotes]);
  useEffect(() => { chordProgressionRef.current = chordProgression; }, [chordProgression]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);
  useEffect(() => { lengthBarsRef.current = lengthBars; }, [lengthBars]);

  // --- Initialisation ---
  useEffect(() => {
    // Générer un pattern initial
    handleGeneratePattern();
    // Accords par défaut
    setChordProgression([
      { id: 1, root: 'C', type: 'm7', name: 'C m7' },
      { id: 2, root: 'F', type: 'Majeur', name: 'F Majeur' },
      { id: 3, root: 'G', type: '7', name: 'G 7' },
      { id: 4, root: 'C', type: 'm7', name: 'C m7' },
    ]);
  }, []);

  // --- Contrôleur de Lecture ---
  const togglePlay = async () => {
    if (!isPlaying) {
      // Démarrer la lecture
      if (!audio.ctx) audio.init();
      // S'assurer que le contexte tourne
      if (audio.ctx?.state === 'suspended') {
        await audio.ctx.resume();
      }
      setIsPlaying(true);
    } else {
      // Arrêter la lecture
      setIsPlaying(false);
    }
  };

  // --- Logique du Séquenceur (Scheduler) ---
  
  // Programmer un pas (visuel + audio)
  const scheduleNote = useCallback((stepNumber: number, time: number) => {
    // Mise à jour tête de lecture
    requestAnimationFrame(() => {
      setCurrentStep(stepNumber);
    });

    const secPerBeat = 60 / tempoRef.current;
    const secPerStep = secPerBeat / 4;

    if (activeTabRef.current === 'drums') {
      DRUM_TRACKS.forEach((track, index) => {
        if (drumGridRef.current[index][stepNumber]) {
          audio.playDrum(track.audioKey, time);
        }
      });
    } else if (activeTabRef.current === 'pattern') {
      // Lecture Pattern
      const patternLengthSteps = lengthBarsRef.current * 16;
      const loopStep = stepNumber % patternLengthSteps;
      
      const notes = generatedNotesRef.current;
      const notesToPlay = notes.filter(n => n.startTime === loopStep);
      
      notesToPlay.forEach(note => {
        let instr: 'bass'|'lead'|'piano'|'pad' = 'piano';
        const instName = instrumentRef.current;
        if (instName === 'Basse') instr = 'bass';
        else if (instName.includes('Lead')) instr = 'lead';
        
        const durationSeconds = note.duration * secPerStep;
        audio.playNote(note, time, instr, durationSeconds);
      });
    } else if (activeTabRef.current === 'chords') {
      // Lecture Accords
      // Joue un accord tous les 16 pas (1 mesure)
      const progression = chordProgressionRef.current;
      if (progression.length === 0) return;

      if (stepNumber % 16 === 0) {
        // Début de mesure
        const barIndex = Math.floor(stepNumber / 16);
        const chord = progression[barIndex % progression.length];

        if (chord) {
          const rootIndex = NOTES_NAMES.indexOf(chord.root);
          const basePitch = 60 + rootIndex; // C4 base
          const intervals = CHORD_TYPES[chord.type];

          // Joue chaque note de l'accord
          intervals.forEach(interval => {
            const note: Note = {
              pitch: basePitch + interval,
              startTime: 0,
              duration: 16, // 4 temps
              velocity: 80
            };
            const durationSeconds = 4 * secPerBeat; 
            audio.playNote(note, time, 'pad', durationSeconds);
          });
        }
      }
    }
  }, []);

  // Boucle Lookahead
  const scheduler = useCallback(() => {
    if (!audio.ctx) return;
    
    const tempoVal = tempoRef.current;
    const secondsPerBeat = 60.0 / tempoVal;
    const secondsPerStep = secondsPerBeat / 4; 
    const scheduleAheadTime = 0.1; 
    const lookahead = 25.0; // ms

    while (nextNoteTimeRef.current < audio.ctx.currentTime + scheduleAheadTime) {
      scheduleNote(stepRef.current, nextNoteTimeRef.current);
      
      nextNoteTimeRef.current += secondsPerStep;
      
      // Détermine la longueur de la boucle selon l'onglet
      let maxSteps = BARS * 16;
      if (activeTabRef.current === 'chords' && chordProgressionRef.current.length > 0) {
        maxSteps = chordProgressionRef.current.length * 16;
      }
      
      stepRef.current = (stepRef.current + 1) % maxSteps; 
    }
    
    timerIDRef.current = window.setTimeout(scheduler, lookahead);
  }, [scheduleNote]);

  // Effet pour démarrer/arrêter le scheduler
  useEffect(() => {
    if (isPlaying) {
      if (!audio.ctx) audio.init();
      
      nextNoteTimeRef.current = audio.ctx!.currentTime + 0.05;
      stepRef.current = 0;
      setCurrentStep(0);
      
      scheduler();
    }

    return () => {
      if (timerIDRef.current) window.clearTimeout(timerIDRef.current);
    };
  }, [isPlaying, scheduler]);


  // --- Actions ---

  const handleToggleStep = (trackIdx: number, stepIdx: number) => {
    const newGrid = [...drumGrid];
    newGrid[trackIdx][stepIdx] = !newGrid[trackIdx][stepIdx];
    setDrumGrid(newGrid);
  };

  const handleClearDrum = () => {
    setDrumGrid(DRUM_TRACKS.map(() => Array(TOTAL_STEPS).fill(false)));
  };

  const handleGeneratePattern = () => {
    const notes = generatePatternLogic(style, instrument, keyRoot, lengthBars, density);
    setGeneratedNotes(notes);
  };

  const handleAddChord = () => {
    const newChord: ChordItem = {
      id: Date.now(),
      root: newChordRoot,
      type: newChordType,
      name: `${newChordRoot} ${newChordType}`
    };
    setChordProgression([...chordProgression, newChord]);
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
          if (active) {
            notes.push({
              pitch: DRUM_TRACKS[trackIdx].midiNote,
              startTick: step * 120, // 480PPQ / 4 = 120 ticks par 16ème
              durationTicks: 60,
              channel: 9 // Canal Batterie GM
            });
          }
        });
      });
      midiBytes = writer.createMidiFile(notes);
      fileName = 'sequence_batterie.mid';
    } else if (activeTab === 'pattern') {
      const notes = generatedNotes.map(n => ({
        pitch: n.pitch,
        startTick: n.startTime * 120,
        durationTicks: n.duration * 120,
        channel: 0
      }));
      midiBytes = writer.createMidiFile(notes);
      fileName = `${style.toLowerCase()}_${instrument.toLowerCase()}.mid`;
    } else if (activeTab === 'chords') {
      const notes: any[] = [];
      // Conversion des accords en événements MIDI
      chordProgression.forEach((chord, index) => {
        const rootIndex = NOTES_NAMES.indexOf(chord.root);
        const basePitch = 60 + rootIndex;
        const intervals = CHORD_TYPES[chord.type];
        const barStartTick = index * 16 * 120; // 16 steps * 120 ticks/step
        const durationTicks = 16 * 120; // 4 temps

        intervals.forEach(interval => {
          notes.push({
            pitch: basePitch + interval,
            startTick: barStartTick,
            durationTicks: durationTicks,
            channel: 0 
          });
        });
      });
      midiBytes = writer.createMidiFile(notes);
      fileName = 'progression_accords.mid';
    }

    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- RENDU ---

  return (
    <div className="min-h-screen bg-neutral-900 text-gray-200 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* HEADER */}
      <header className="h-16 border-b border-gray-800 flex items-center px-6 bg-neutral-900/90 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Music className="text-white" size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-none">PatternLab</h1>
            <p className="text-xs text-gray-500 font-mono">Générateur & Séquenceur MIDI</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
           {/* Indicateur de Statut */}
           <div className={`flex items-center gap-2 text-xs font-mono px-3 py-1 rounded-full border ${isPlaying ? 'border-green-900 bg-green-900/20 text-green-400' : 'border-gray-800 bg-gray-800 text-gray-500'}`}>
              <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
              {isPlaying ? 'LECTURE' : 'STOP'}
           </div>
        </div>
      </header>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* BARRE LATÉRALE GAUCHE : CONTRÔLES */}
        <aside className="w-full lg:w-72 bg-neutral-900 border-r border-gray-800 p-6 flex flex-col overflow-y-auto">
          
          <div className="mb-8">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center">
              <Sliders size={14} className="mr-2"/> Transport Global
            </h2>
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
              <div className="flex items-center justify-between mb-4">
                 <button 
                  onClick={togglePlay}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl ${isPlaying ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' : 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-cyan-500/20'}`}
                >
                  {isPlaying ? <Square fill="currentColor" size={24}/> : <Play fill="currentColor" className="ml-1" size={28}/>}
                </button>
                <div className="text-right">
                   <div className="text-3xl font-mono font-bold text-gray-100">{tempo}</div>
                   <div className="text-xs text-gray-500">BPM</div>
                </div>
              </div>
              <Slider label="Tempo" value={tempo} min={60} max={180} onChange={setTempo} />
            </div>
          </div>

          <div className="flex-1">
            {activeTab === 'pattern' ? (
              <>
              <h2 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center">
                <Grid3X3 size={14} className="mr-2"/> Paramètres Générateur
              </h2>
              <div className="space-y-4">
                <Select 
                  label="Style" 
                  value={style} 
                  options={['Lo-Fi', 'Jazz', 'Pop', 'Funk']} 
                  onChange={setStyle} 
                />
                <Select 
                  label="Instrument" 
                  value={instrument} 
                  options={['Basse', 'Piano / Accords', 'Lead / Mélodie']} 
                  onChange={setInstrument} 
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select 
                    label="Tonalité" 
                    value={keyRoot} 
                    options={NOTES_NAMES} 
                    onChange={setKeyRoot} 
                  />
                   <Select 
                    label="Longueur (Mesures)" 
                    value={lengthBars} 
                    options={[1, 2, 4]} 
                    onChange={(v:string) => setLengthBars(Number(v))} 
                  />
                </div>
                <Slider label="Densité" value={density} min={10} max={100} onChange={setDensity} unit="%" />
              </div>
              </>
            ) : activeTab === 'chords' ? (
              <>
                 <h2 className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-4 flex items-center">
                  <Plus size={14} className="mr-2"/> Ajouter un Accord
                </h2>
                <div className="space-y-4 bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                  <div className="grid grid-cols-2 gap-2">
                    <Select 
                      label="Note" 
                      value={newChordRoot} 
                      options={NOTES_NAMES} 
                      onChange={setNewChordRoot} 
                    />
                     <Select 
                      label="Type" 
                      value={newChordType} 
                      options={Object.keys(CHORD_TYPES)} 
                      onChange={setNewChordType} 
                    />
                  </div>
                  <Button onClick={handleAddChord} variant="success" className="w-full">
                    Ajouter à la Séquence
                  </Button>
                </div>
                <div className="mt-4 text-xs text-gray-500 italic">
                  Ajoute 1 Mesure (4 temps) de l'accord sélectionné.
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-500 italic text-center mt-10">
                Sélectionnez des motifs sur la grille pour créer un rythme.
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-800">
             <Button onClick={handleExportMidi} variant="secondary" className="w-full" icon={Download}>
               Exporter Fichier MIDI
             </Button>
             <p className="text-[10px] text-gray-600 mt-2 text-center">
               Télécharge un fichier .mid compatible avec tous les DAW.
             </p>
          </div>
        </aside>

        {/* ESPACE DE TRAVAIL (DROITE) */}
        <section className="flex-1 flex flex-col bg-[#111] overflow-hidden">
          
          {/* ONGLETS */}
          <div className="flex border-b border-gray-800 px-6 pt-6 gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('drums')}
              className={`px-6 py-2 text-sm font-medium rounded-t-lg transition-colors border-t border-l border-r flex-shrink-0 ${
                activeTab === 'drums' 
                  ? 'bg-neutral-800 border-gray-700 text-cyan-400' 
                  : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Séquenceur Batterie
            </button>
            <button
              onClick={() => setActiveTab('pattern')}
              className={`px-6 py-2 text-sm font-medium rounded-t-lg transition-colors border-t border-l border-r flex-shrink-0 ${
                activeTab === 'pattern' 
                  ? 'bg-neutral-800 border-gray-700 text-indigo-400' 
                  : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Générateur de Motifs
            </button>
            <button
              onClick={() => setActiveTab('chords')}
              className={`px-6 py-2 text-sm font-medium rounded-t-lg transition-colors border-t border-l border-r flex-shrink-0 ${
                activeTab === 'chords' 
                  ? 'bg-neutral-800 border-gray-700 text-emerald-400' 
                  : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              Accords
            </button>
          </div>

          {/* CONTENU ONGLETS */}
          <div className="flex-1 p-6 overflow-y-auto bg-neutral-800">
            
            {activeTab === 'drums' && (
              <div className="h-full flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-gray-300 font-medium flex items-center"><Volume2 className="mr-2" size={16}/> Boîte à Rythmes 4 Pistes</h3>
                  <Button variant="danger" className="text-xs px-2 py-1" icon={Trash2} onClick={handleClearDrum}>Effacer</Button>
                </div>
                
                <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
                  <div className="min-w-[1000px] select-none">
                    {/* En-tête (Marqueurs de mesure) */}
                    <div className="flex ml-24 mb-2">
                       {Array.from({ length: 4 }).map((_, barIdx) => (
                         <div key={barIdx} className="flex-1 border-b border-gray-600 text-xs text-gray-500 pb-1 font-mono pl-1">
                           Mesure {barIdx + 1}
                         </div>
                       ))}
                    </div>

                    {DRUM_TRACKS.map((track, trackIdx) => (
                      <div key={track.id} className="flex mb-3">
                        {/* En-tête de Piste */}
                        <div className="w-24 flex-shrink-0 flex items-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                          {track.name}
                        </div>
                        {/* Pas (Steps) */}
                        <div className="flex-1 flex gap-[2px]">
                          {drumGrid[trackIdx].map((isActive, stepIdx) => {
                             const isBeat = stepIdx % 4 === 0;
                             const isBarStart = stepIdx % 16 === 0;
                             const isCurrent = isPlaying && currentStep === stepIdx;
                             
                             return (
                               <div 
                                 key={stepIdx}
                                 onClick={() => handleToggleStep(trackIdx, stepIdx)}
                                 className={`
                                   h-10 flex-1 rounded-sm cursor-pointer transition-all duration-75 relative
                                   ${isBarStart ? 'ml-2' : ''}
                                   ${isActive ? track.color : 'bg-gray-700/50 hover:bg-gray-600'}
                                   ${isCurrent ? 'brightness-150 ring-2 ring-white z-10 scale-105' : ''}
                                   ${isBeat && !isActive ? 'bg-gray-600/50' : ''}
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
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-gray-300 font-medium">MIDI Procédural</h3>
                    <div className="flex gap-2 text-xs text-gray-500 font-mono bg-black/20 px-3 py-1 rounded">
                      <span>{generatedNotes.length} notes</span>
                      <span className="text-gray-700">|</span>
                      <span>{instrument}</span>
                      <span className="text-gray-700">|</span>
                      <span>{keyRoot} {style}</span>
                    </div>
                  </div>
                  <Button variant="accent" icon={RefreshCw} onClick={handleGeneratePattern}>
                    Re-Générer
                  </Button>
                </div>

                {/* VISUALISATION PIANO ROLL */}
                <div className="flex-1 bg-[#1a1a1a] rounded-lg border border-gray-700 relative overflow-hidden shadow-inner">
                  
                  {/* Fond Grille */}
                  <div className="absolute inset-0 pointer-events-none opacity-20" 
                    style={{ 
                      backgroundImage: 'linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)',
                      backgroundSize: `${100 / (lengthBars * 4)}% 20px`
                    }}
                  />

                  {/* Tête de lecture */}
                  {isPlaying && (
                    <div 
                      className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 transition-all duration-75"
                      style={{ 
                        left: `${(currentStep / (lengthBars * 16)) * 100}%` 
                      }}
                    />
                  )}

                  {/* Notes */}
                  {generatedNotes.length === 0 ? (
                     <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                       Appuyez sur "Re-Générer" pour créer un motif
                     </div>
                  ) : (
                    <div className="absolute inset-0 m-4">
                       {generatedNotes.map((note, idx) => {
                         const minPitch = Math.min(...generatedNotes.map(n => n.pitch)) - 2;
                         const maxPitch = Math.max(...generatedNotes.map(n => n.pitch)) + 2;
                         const pitchRange = maxPitch - minPitch || 12;
                         
                         const topPct = 100 - ((note.pitch - minPitch) / pitchRange) * 100;
                         const leftPct = (note.startTime / (lengthBars * 16)) * 100;
                         const widthPct = (note.duration / (lengthBars * 16)) * 100;

                         return (
                           <div
                             key={idx}
                             className="absolute h-3 rounded-sm bg-indigo-500 border border-indigo-300/50 shadow-sm"
                             style={{
                               top: `${topPct}%`,
                               left: `${leftPct}%`,
                               width: `${widthPct}%`,
                             }}
                             title={`Pitch: ${note.pitch}`}
                           />
                         )
                       })}
                    </div>
                  )}
                </div>
                
                <div className="mt-4 text-xs text-gray-500 font-mono text-center">
                   Aperçu : Synthèse Web Audio (Approximation) • Export : Fichier MIDI Standard
                </div>
              </div>
            )}
            
            {activeTab === 'chords' && (
              <div className="h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-gray-300 font-medium flex items-center"><ListMusic className="mr-2" size={16}/> Chronologie des Accords</h3>
                  <div className="text-xs text-gray-500 font-mono">
                    Total : {chordProgression.length} Mesures
                  </div>
                </div>

                <div className="flex-1 bg-neutral-900/50 rounded-lg border border-gray-800 relative overflow-x-auto p-8 custom-scrollbar">
                   {chordProgression.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-600">
                        <ListMusic size={48} className="mb-4 opacity-50"/>
                        <p>Aucun accord ajouté.</p>
                        <p className="text-xs mt-2">Utilisez la barre latérale pour ajouter des accords.</p>
                      </div>
                   ) : (
                     <div className="flex gap-1 h-32 relative">
                        {/* Tête de lecture Accords */}
                        {isPlaying && (
                          <div 
                            className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 transition-all duration-75"
                            style={{ 
                              left: `${(currentStep / (chordProgression.length * 16)) * (chordProgression.length * 160)}px` 
                            }}
                          />
                        )}
                        
                        {chordProgression.map((chord, idx) => {
                          const isPlayingThisChord = isPlaying && Math.floor(currentStep / 16) === idx;
                          
                          return (
                            <div key={chord.id} className="relative group">
                              <div 
                                className={`
                                  w-40 h-32 rounded-lg border-2 flex flex-col items-center justify-center transition-all
                                  ${isPlayingThisChord ? 'border-emerald-400 bg-emerald-900/20 shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}
                                `}
                              >
                                <span className="text-2xl font-bold text-gray-200">{chord.root}</span>
                                <span className="text-sm text-gray-400 font-mono">{chord.type}</span>
                                <div className="absolute bottom-2 text-[10px] text-gray-600">Mesure {idx + 1}</div>
                              </div>
                              <button 
                                onClick={() => handleRemoveChord(chord.id)}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-900 text-red-200 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })}
                     </div>
                   )}
                </div>
                 <div className="mt-4 text-xs text-gray-500 font-mono text-center">
                   L'aperçu joue des nappes • Chaque bloc représente 4 temps (1 Mesure)
                </div>
              </div>
            )}

          </div>
        </section>
      </main>
    </div>
  );
};

// Render Root
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}