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

declare module 'claude-code' {
  interface PluginState {
    'obsidian': {
      briefing: Briefing;
      // The clock the pane reads while a briefing runs; redraws the counter.
      now: number;
      // Whether the "Files opened" list under the briefing is unfolded.
      filesOpen: boolean;
    };
  }
}
