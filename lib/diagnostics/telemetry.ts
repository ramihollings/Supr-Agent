class SuprTelemetry {
  private thresholds = {
    maxReasoningSteps: 10,
    maxRepeatedTools: 4,
    maxTokenCost: 10000
  };

  private sessionState = {
    steps: 0,
    tools: [] as string[],
    totalTokens: 0,
    anomalies: [] as string[]
  };

  logDecision(tool: string, tokenCost: number) {
    this.sessionState.steps++;
    this.sessionState.tools.push(tool);
    this.sessionState.totalTokens += tokenCost;

    this.analyzeBehavior();
  }

  private analyzeBehavior() {
    // 1. Check Chain Length Spike
    if (this.sessionState.steps > this.thresholds.maxReasoningSteps) {
      this.flagAnomaly(`Reasoning Chain Spike: Reached ${this.sessionState.steps} steps without resolution.`);
    }

    // 2. Check Tool Distribution (Looping)
    const recentTools = this.sessionState.tools.slice(-this.thresholds.maxRepeatedTools);
    if (recentTools.length === this.thresholds.maxRepeatedTools && new Set(recentTools).size === 1) {
      this.flagAnomaly(`Tool Loop Anomaly: Tool '${recentTools[0]}' invoked ${this.thresholds.maxRepeatedTools} times consecutively.`);
    }

    // 3. Cost Anomaly
    if (this.sessionState.totalTokens > this.thresholds.maxTokenCost) {
      this.flagAnomaly(`Cost Anomaly: Session consumed ${this.sessionState.totalTokens} tokens (Limit: ${this.thresholds.maxTokenCost}).`);
    }
  }

  private flagAnomaly(message: string) {
    if (!this.sessionState.anomalies.includes(message)) {
      this.sessionState.anomalies.push(message);
      console.log(`[ALERT] ${message}`);
    }
  }

  getAnomalies() {
    return this.sessionState.anomalies;
  }
}

export function runTelemetryDiagnostic() {
  console.log('--- DIAGNOSTIC 5: Behavioral Anomaly Tracing ---');
  console.log('[+] Simulating circular dependency on Glidepath (Task A -> Task B -> Task A)...');

  const telemetry = new SuprTelemetry();

  // Simulate looping
  for (let step = 1; step <= 12; step++) {
    // Simulate switching between Task A and B but using the exact same 'fetch_dependency' tool
    const toolUsed = 'fetch_dependency'; 
    const tokensBurned = 1050; // High token burn per loop
    
    telemetry.logDecision(toolUsed, tokensBurned);
  }

  const detectedAnomalies = telemetry.getAnomalies();
  
  if (detectedAnomalies.length >= 3) {
    console.log('\n--- PASS: Telemetry successfully intercepted Chain Spike, Tool Loop, and Cost Anomalies ---\n');
    return true;
  } else {
    console.error('\n--- FAIL: Telemetry missed anomalies ---\n');
    return false;
  }
}

if (require.main === module) {
  runTelemetryDiagnostic();
}
