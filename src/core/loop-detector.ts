export class ToolCallLoopDetector {
  private recentCalls: Array<{ tool: string; params: string; failed: boolean }> = [];
  private totalCalls = 0;
  private hardAborted = false;
  private recentStepTexts: Array<string> = [];
  private consecutiveNoActionSteps = 0;
  private static readonly MAX_STEP_TEXTS = 12;

  private static readonly HIGH_TOLERANCE_TOOLS = new Set([
    'fetch_url',
    'read_file',
    'list_dir',
    'web_search',
    'github_api',
    'analyze_image',
  ]);

  private readonly absoluteMax: number;
  private readonly failedAbsoluteMax: number;
  private readonly noActionMax: number;
  private readonly identicalThreshold: number;
  private readonly similarThreshold: number;
  private readonly textRepeatThreshold: number;
  private readonly sameToolThreshold: number;

  constructor(cfg?: {
    absoluteMax?: number;
    failedAbsoluteMax?: number;
    noActionMax?: number;
    identicalThreshold?: number;
    similarThreshold?: number;
    textRepeatThreshold?: number;
    sameToolThreshold?: number;
  }) {
    this.absoluteMax = cfg?.absoluteMax ?? 100;
    this.failedAbsoluteMax = cfg?.failedAbsoluteMax ?? 25;
    this.noActionMax = cfg?.noActionMax ?? 10;
    this.identicalThreshold = cfg?.identicalThreshold ?? 5;
    this.similarThreshold = cfg?.similarThreshold ?? 8;
    this.textRepeatThreshold = cfg?.textRepeatThreshold ?? 3;
    this.sameToolThreshold = cfg?.sameToolThreshold ?? 10;
  }

  private getSameToolThreshold(toolName: string, failingCount: number): number {
    const isHigh = ToolCallLoopDetector.HIGH_TOLERANCE_TOOLS.has(toolName);
    const base = isHigh ? this.sameToolThreshold + 2 : this.sameToolThreshold;
    if (failingCount >= 3) {
      return Math.max(2, Math.floor(base * 0.5));
    }
    return base;
  }

  record(toolName: string, params: Record<string, any>, failed: boolean = false): void {
    const paramsKey = JSON.stringify(params).slice(0, 200);
    this.recentCalls.push({ tool: toolName, params: paramsKey, failed });
    this.totalCalls++;
    this.consecutiveNoActionSteps = 0;
    if (this.recentCalls.length > 30) {
      this.recentCalls.shift();
    }
  }

  recordNoActionResult(): boolean {
    this.consecutiveNoActionSteps++;
    return this.consecutiveNoActionSteps >= this.noActionMax;
  }

  recordStepText(text: string): void {
    if (!text || text.length < 10) return;
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!normalized) return;
    this.recentStepTexts.push(normalized);
    if (this.recentStepTexts.length > ToolCallLoopDetector.MAX_STEP_TEXTS) {
      this.recentStepTexts.shift();
    }
  }

  detectAbsoluteLimit(): boolean {
    if (this.totalCalls >= this.absoluteMax) return true;
    const failCount = this.recentCalls.filter(c => c.failed).length;
    if (failCount >= this.failedAbsoluteMax) return true;
    return false;
  }

  detectIdentical(): { tool: string; count: number; message: string } | null {
    if (this.recentCalls.length < 3) return null;

    const last = this.recentCalls[this.recentCalls.length - 1];

    let identicalCount = 0;
    for (let i = this.recentCalls.length - 1; i >= 0; i--) {
      if (this.recentCalls[i].tool === last.tool && this.recentCalls[i].params === last.params) {
        identicalCount++;
      } else {
        break;
      }
    }

    if (identicalCount >= this.identicalThreshold) {
      this.hardAborted = true;
      return {
        tool: last.tool,
        count: identicalCount,
        message: `[SYSTEM] You called "${last.tool}" ${identicalCount} times with identical parameters and got the same result. This is a hard loop — stop immediately.`,
      };
    }

    return null;
  }

  detectSimilarLoop(): { tool: string; count: number; message: string } | null {
    if (this.recentCalls.length < 4) return null;

    const last = this.recentCalls[this.recentCalls.length - 1];
    let similarCount = 0;

    for (let i = this.recentCalls.length - 1; i >= 0; i--) {
      const call = this.recentCalls[i];
      if (call.tool !== last.tool) break;
      if (call.failed || last.failed) {
        similarCount++;
      } else {
        break;
      }
    }

    if (similarCount >= this.similarThreshold) {
      this.hardAborted = true;
      return {
        tool: last.tool,
        count: similarCount,
        message: `[SYSTEM] You called "${last.tool}" ${similarCount} times with different params but all are failing. This is a failing loop — stop immediately. Tell the user you cannot complete this task.`,
      };
    }

    return null;
  }

  /**
   * M9: Detect two-tool alternation patterns (e.g. A B A B A B) that
   * `detectIdentical` misses because the LAST call is not preceded by N
   * consecutive identical calls. A common failure mode is the model
   * ping-ponging between a "check status" tool and a "fix it" tool.
   */
  detectAlternation(): { toolA: string; toolB: string; count: number; message: string } | null {
    if (this.recentCalls.length < 6) return null;

    // Check the last 6 calls: if they alternate between exactly two tools,
    // that's a hard loop regardless of which one is "last".
    const window = this.recentCalls.slice(-6);
    const toolsInWindow = new Set(window.map(c => c.tool));
    if (toolsInWindow.size !== 2) return null;

    const [t0, t1] = [...toolsInWindow];
    // Expected pattern: t0,t1,t0,t1,t0,t1 (or t1,t0,t1,t0,t1,t0)
    const isAlternating = (a: string, b: string) =>
      window.every((c, i) => c.tool === (i % 2 === 0 ? a : b));
    const alternating = isAlternating(t0, t1) || isAlternating(t1, t0);
    if (!alternating) return null;

    this.hardAborted = true;
    return {
      toolA: t0,
      toolB: t1,
      count: window.length,
      message: `[SYSTEM] You are alternating between "${t0}" and "${t1}" without making progress. This is a ping-pong loop — stop immediately and try a different approach.`,
    };
  }

  detectTextRepetition(): { pattern: string; count: number } | null {
    if (this.recentStepTexts.length < this.textRepeatThreshold) return null;

    const texts = this.recentStepTexts;
    const last = texts[texts.length - 1];

    let repeatCount = 0;
    for (let i = texts.length - 1; i >= 0; i--) {
      const similarity = this.textSimilarity(last, texts[i]);
      if (similarity >= 0.7) {
        repeatCount++;
      } else {
        break;
      }
    }

    if (repeatCount >= this.textRepeatThreshold) {
      return {
        pattern: last.slice(0, 60),
        count: repeatCount,
      };
    }

    return null;
  }

  private textSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;

    const setA = new Set(a.split(' '));
    const setB = new Set(b.split(' '));
    const intersection = [...setA].filter(w => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  detectSameTool(): { tool: string; count: number } | null {
    if (this.recentCalls.length < 3) return null;

    const last = this.recentCalls[this.recentCalls.length - 1];

    let consecutiveCount = 0;
    let failingConsecutive = 0;
    for (let i = this.recentCalls.length - 1; i >= 0; i--) {
      if (this.recentCalls[i].tool === last.tool) {
        consecutiveCount++;
        if (this.recentCalls[i].failed) failingConsecutive++;
      } else {
        break;
      }
    }

    const threshold = this.getSameToolThreshold(last.tool, failingConsecutive);
    if (consecutiveCount >= threshold) {
      return { tool: last.tool, count: consecutiveCount };
    }

    if (this.recentCalls.length >= 6) {
      const lastN = this.recentCalls.slice(-6);
      const toolCounts: Record<string, number> = {};
      for (const call of lastN) {
        toolCounts[call.tool] = (toolCounts[call.tool] || 0) + 1;
      }
      for (const [tool, count] of Object.entries(toolCounts)) {
        if (count >= Math.floor(this.sameToolThreshold * 1.5)) {
          return { tool, count };
        }
      }
    }

    return null;
  }

  isHardAborted(): boolean {
    return this.hardAborted;
  }

  reset(): void {
    this.recentCalls = [];
    this.totalCalls = 0;
    this.hardAborted = false;
    this.recentStepTexts = [];
    this.consecutiveNoActionSteps = 0;
  }
}
