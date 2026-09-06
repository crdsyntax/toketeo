/**
 * runtime/evaluation/regression.js
 * Regression Baseline Tracker and Comparator (§F8E).
 * Ensures that changes do not break established invariants or scenarios.
 */

const fs = require('fs');
const path = require('path');

class RegressionTracker {
  constructor({ benchmarksDir = null } = {}) {
    const root = process.cwd();
    this.benchmarksDir = benchmarksDir || path.join(root, 'benchmarks');
    this.baselinesDir = path.join(this.benchmarksDir, 'baselines');
    this.runsDir = path.join(this.benchmarksDir, 'runs');

    this._ensureDirs();
  }

  _ensureDirs() {
    if (!fs.existsSync(this.baselinesDir)) {
      fs.mkdirSync(this.baselinesDir, { recursive: true });
    }
    if (!fs.existsSync(this.runsDir)) {
      fs.mkdirSync(this.runsDir, { recursive: true });
    }
  }

  getBaseline(suiteName = 'default') {
    const baselinePath = path.join(this.baselinesDir, `${suiteName}.json`);
    if (!fs.existsSync(baselinePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch {
      return null;
    }
  }

  saveBaseline(suiteName, scorecardJson) {
    const baselinePath = path.join(this.baselinesDir, `${suiteName}.json`);
    fs.writeFileSync(baselinePath, JSON.stringify(scorecardJson, null, 2), 'utf8');
    return baselinePath;
  }

  saveRun(scorecardJson) {
    const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const runPath = path.join(this.runsDir, filename);
    fs.writeFileSync(runPath, JSON.stringify(scorecardJson, null, 2), 'utf8');
    return runPath;
  }

  compare(currentResults, baseline) {
    if (!baseline || !Array.isArray(baseline.results)) {
      return {
        has_baseline: false,
        regressions: [],
        improvements: [],
        unchanged: currentResults.length
      };
    }

    const baselineMap = new Map();
    for (const res of baseline.results) {
      baselineMap.set(res.scenario_id, res.status);
    }

    const regressions = [];
    const improvements = [];
    let unchanged = 0;

    for (const cur of currentResults) {
      const baseStatus = baselineMap.get(cur.scenario_id);
      if (!baseStatus) continue;

      if (baseStatus === 'PASSED' && cur.status !== 'PASSED') {
        regressions.push({
          scenario_id: cur.scenario_id,
          baseline_status: baseStatus,
          current_status: cur.status,
          error: cur.error
        });
      } else if (baseStatus !== 'PASSED' && cur.status === 'PASSED') {
        improvements.push({
          scenario_id: cur.scenario_id,
          baseline_status: baseStatus,
          current_status: cur.status
        });
      } else {
        unchanged++;
      }
    }

    return {
      has_baseline: true,
      baseline_version: baseline.version || '1.0.0',
      regressions,
      improvements,
      unchanged
    };
  }
}

module.exports = {
  RegressionTracker
};
