export type Briefing =
  | { status: 'idle' }
  | {
      status: 'running';
      agentId?: string;
      startedAt: number;
      // What the briefer's latest tool call is doing, as one line.
      activity?: string;
      sources: string[];
    }
  | { status: 'done'; text: string; sources: string[]; writtenAt: number }
  | { status: 'failed'; message: string };

export type Challenge =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; text: string }
  | { status: 'failed'; message: string };

// The briefing as kept between sessions, one for the day it was written.
export type Saved = {
  date: string;
  text: string;
  sources: string[];
  writtenAt: number;
};

// The challenge as kept between sessions: the one chosen last, and its day.
export type ChallengeStore = { date: string; text: string };

// The input of a Read, Glob or Grep call, as far as the pane describes it.
export type ToolInput = { file_path?: string; pattern?: string; path?: string };

// One tool call from the briefer's transcript.
export type ToolUse = { tool: string; input: Record<string, unknown> };

// One part of the briefing: a `## ` heading and the text under it. The text
// before the first heading has no heading.
export type Section = { heading?: string; body: string };

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

// One memory file: its frontmatter and when it was last changed.
export type Memory = {
  file: string;
  name: string;
  description: string;
  type: MemoryType;
  mtimeMs: number;
};

declare module 'claude-code' {
  interface PluginState {
    'obsidian': {
      briefing: Briefing;
      // The clock the pane reads while a briefing runs; redraws the counter.
      now: number;
      // Whether the "Files opened" list under the briefing is unfolded.
      filesOpen: boolean;
      // The Challenge of the Day shown in its box under the briefing.
      challenge: Challenge;
      // The memory files the /memories pane lists.
      memories: Memory[];
      // The file of the memory the /memories pane shows in full; empty for
      // none.
      selectedMemory: string;
    };
  }
}
