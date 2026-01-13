import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Square,
  Download,
  Volume2,
  Trash2,
  Plus,
  X,
  ListMusic,
  ChevronDown,
  FlaskConical,
} from "lucide-react";

/**
 * ==========================================
 * UTILITAIRES MIDI (Mini Writer)
 * ==========================================
 */

class MidiWriter {
  static toVLQ(n: number): number[] {
    let buffer = [n & 0x7f];
    while (n >>= 7) buffer.push((n & 0x7f) | 0x80);
    return buffer.reverse();
  }

  static int32ToBytes(n: number) {
    return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }

  static createMidiFile(
    tempo: number,
    drumGrid: boolean[][],
    chords: ChordItem[]
  ) {
    const ticksPerQuarter = 480;
    const ticksPerStep = ticksPerQuarter / 4;

    const header = [
      0x4d, 0x54, 0x68, 0x64,
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x01,
      0x00, 0x02,
      (ticksPerQuarter >> 8) & 0xff,
      ticksPerQuarter & 0xff,
    ];

    const microsecondsPerQuarter = Math.round(60000000 / tempo);

    let drumEvents: number[] = [
      0x00,
      0xff,
      0x51,
      0x03,
      (microsecondsPerQuarter >> 16) & 0xff,
      (microsecondsPerQuarter >> 8) & 0xff,
      microsecondsPerQuarter & 0xff,
    ];

    let lastTick = 0;
    const drumNotes: { tick: number; data: number[] }[] = [];

    drumGrid.forEach((track, trackIdx) => {
      const note = DRUM_TRACKS[trackIdx].midiNote;
      track.forEach((active, stepIdx) => {
        if (active) {
          const start = stepIdx * ticksPerStep;
          const end = start + ticksPerStep - 1;
          drumNotes.push({ tick: start, data: [0x99, note, 0x64] });
          drumNotes.push({ tick: end, data: [0x89, note, 0x00] });
        }
      });
    });

    drumNotes.sort((a, b) => a.tick - b.tick);
    drumNotes.forEach((e) => {
      drumEvents.push(...this.toVLQ(e.tick - lastTick), ...e.data);
      lastTick = e.tick;
    });

    drumEvents.push(0x00, 0xff, 0x2f, 0x00);

    const drumTrack = [
      0x4d,
      0x54,
      0x72,
      0x6b,
      ...this.int32ToBytes(drumEvents.length),
      ...drumEvents,
    ];

    let chordEvents: number[] = [];
    let lastChordTick = 0;
    const chordNotes: { tick: number; data: number[] }[] = [];

    chords.forEach((chord, idx) => {
      const rootIdx = NOTES_NAMES.indexOf(chord.root);
      const base = 60 + rootIdx;
      const intervals = CHORD_TYPES[chord.type];
      const start = idx * ticksPerStep * 16;
      const end = start + ticksPerStep * 16 - 1;

      intervals.forEach((i) => {
        chordNotes.push({ tick: start, data: [0x90, base + i, 0x50] });
        chordNotes.push({ tick: end, data: [0x80, base + i, 0x00] });
      });
    });

    chordNotes.sort((a, b) => a.tick - b.tick);
    chordNotes.forEach((e) => {
      chordEvents.push(...this.toVLQ(e.tick - lastChordTick), ...e.data);
      lastChordTick = e.tick;
    });

    chordEvents.push(0x00, 0xff, 0x2f, 0x00);

    const chordTrack = [
      0x4d,
      0x54,
      0x72,
      0x6b,
      ...this.int32ToBytes(chordEvents.length),
      ...chordEvents,
    ];

    return new Uint8Array([...header, ...drumTrack, ...chordTrack]);
  }

  static download(data: Uint8Array, filename: string) {
    const blob = new Blob([data], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * ==========================================
 * TYPES & CONSTANTES
 * ==========================================
 */

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

const NOTES_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const DRUM_TRACKS: DrumTrack[] = [
  { id: 0, name: "KICK", audioKey: "Kick", midiNote: 36, color: "bg-red-600" },
  { id: 1, name: "SNARE", audioKey: "Snare", midiNote: 38, color: "bg-cyan-500" },
  { id: 2, name: "HATS FERMÉ", audioKey: "Hi-Hat Closed", midiNote: 42, color: "bg-orange-600" },
  { id: 3, name: "HATS OUVERT", audioKey: "Hi-Hat Open", midiNote: 46, color: "bg-yellow-500" },
];

const CHORD_TYPES: Record<string, number[]> = {
  Majeur: [0, 4, 7],
  Mineur: [0, 3, 7],
  "7": [0, 4, 7, 10],
  Maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
};

/**
 * ==========================================
 * APP
 * ==========================================
 */

function App() {
  const [tempo, setTempo] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 flex items-center justify-center">
      <div className="text-center">
        <FlaskConical size={48} className="mx-auto mb-4 text-cyan-400" />
        <h1 className="text-2xl font-bold">Pattern Lab</h1>
        <p className="text-gray-500 text-sm">App chargée correctement</p>

        <div className="mt-6 flex gap-4 justify-center">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-6 py-3 rounded-lg bg-cyan-600 text-white font-bold"
          >
            {isPlaying ? "STOP" : "PLAY"}
          </button>

          <button
            onClick={() =>
              MidiWriter.download(
                MidiWriter.createMidiFile(tempo, DRUM_TRACKS.map(() => Array(16).fill(false)), []),
                "test.mid"
              )
            }
            className="px-6 py-3 rounded-lg bg-[#1a212c] text-white font-bold"
          >
            MIDI
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
