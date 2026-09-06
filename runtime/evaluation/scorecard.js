/**
 * runtime/evaluation/scorecard.js
 * Scorecard Generator and Formatter for the Evaluation Harness (§F8D).
 */

class Scorecard {
  constructor({ runId, version = '1.0.0', results = [], baselineComparison = null } = {}) {
    this.runId = runId || `eval-run-${Date.now()}`;
    this.version = version;
    this.evaluatedAt = new Date().toISOString();
    this.results = results;
    this.baselineComparison = baselineComparison;
  }

  calculateMetrics() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    const error = this.results.filter(r => r.status === 'ERROR').length;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    // Category breakdown
    const categories = {};
    for (const res of this.results) {
      const cat = res.category || 'general';
      if (!categories[cat]) {
        categories[cat] = { total: 0, passed: 0, failed: 0 };
      }
      categories[cat].total++;
      if (res.status === 'PASSED') categories[cat].passed++;
      else categories[cat].failed++;
    }

    // Durations
    const durations = this.results.map(r => r.duration_ms || 0);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    return {
      total,
      passed,
      failed,
      error,
      pass_rate: Number(passRate.toFixed(2)),
      categories,
      avg_duration_ms: avgDuration
    };
  }

  toJSON() {
    return {
      run_id: this.runId,
      version: this.version,
      evaluated_at: this.evaluatedAt,
      metrics: this.calculateMetrics(),
      results: this.results,
      baseline_comparison: this.baselineComparison
    };
  }

  formatAscii() {
    const m = this.calculateMetrics();
    const lines = [];

    lines.push('\x1b[1m\x1b[36m=== Toketeo Runtime Evaluation Scorecard ===\x1b[0m');
    lines.push(`Run ID:          ${this.runId}`);
    lines.push(`Runtime Version: ${this.version}`);
    lines.push(`Evaluated At:    ${this.evaluatedAt}`);
    lines.push('────────────────────────────────────────────');
    lines.push(`Total Scenarios: ${m.total}`);
    lines.push(`Passed:          \x1b[32m${m.passed}\x1b[0m`);
    lines.push(`Failed:          ${m.failed > 0 ? '\x1b[31m' : '\x1b[32m'}${m.failed}\x1b[0m`);
    lines.push(`Pass Rate:       \x1b[1m${m.pass_rate >= 100 ? '\x1b[32m' : '\x1b[33m'}${m.pass_rate}%\x1b[0m`);
    lines.push(`Avg Latency:     ${m.avg_duration_ms} ms`);
    lines.push('────────────────────────────────────────────');
    lines.push('\x1b[1mCategory Breakdown:\x1b[0m');

    for (const [cat, data] of Object.entries(m.categories)) {
      const catRate = data.total > 0 ? Math.round((data.passed / data.total) * 100) : 0;
      const color = catRate === 100 ? '\x1b[32m' : '\x1b[31m';
      lines.push(`  - ${cat.padEnd(14)}: ${color}${data.passed}/${data.total} (${catRate}%)\x1b[0m`);
    }

    if (this.baselineComparison) {
      lines.push('────────────────────────────────────────────');
      lines.push('\x1b[1mBaseline Comparison:\x1b[0m');
      lines.push(`  - Regressions:   ${this.baselineComparison.regressions.length === 0 ? '\x1b[32m0 (PASS)\x1b[0m' : `\x1b[31m${this.baselineComparison.regressions.length} (REGRESSION DETECTED)\x1b[0m`}`);
      lines.push(`  - Improvements:  \x1b[32m${this.baselineComparison.improvements.length}\x1b[0m`);
    }

    lines.push('────────────────────────────────────────────\n');
    return lines.join('\n');
  }
}

module.exports = {
  Scorecard
};
