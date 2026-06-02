import fs from "node:fs";
import path from "node:path";
import { type SafetyRule, type PermissionDecision, PermissionResult } from "./SafetyRuleEngine";

export interface RuleCondition {
  field: string;
  operator: "regex_match" | "contains" | "equals" | "not_contains" | "starts_with" | "ends_with";
  pattern: string;
}

export interface GovernanceRule {
  name: string;
  enabled: boolean;
  toolMatcher: string; // e.g. "run_command|run_command_sandbox", "*"
  action: "block" | "warn" | "ask";
  conditions: RuleCondition[];
  message: string;
}

export class RuleEngine implements SafetyRule {
  name = "ConditionRuleEngine";
  private rules: GovernanceRule[] = [];

  constructor(configPath = "agent-config/governance_rules.json") {
    this.loadRules(configPath);
  }

  /**
   * Loads rules from the specified JSON file.
   */
  loadRules(configPath: string): void {
    try {
      const configFile = path.basename(configPath);
      const fullPath = path.join(process.cwd(), "agent-config", configFile);
      if (fs.existsSync(fullPath)) {
        const raw = fs.readFileSync(fullPath, "utf-8");
        this.rules = JSON.parse(raw);
      } else {
        console.warn(`[RuleEngine] Governance rules file not found at ${configPath}. Using empty rules list.`);
        this.rules = [];
      }
    } catch (err: any) {
      console.error("[RuleEngine] Failed to load governance rules:", err);
      this.rules = [];
    }
  }

  /**
   * Check if a tool call matches any enabled governance rules.
   */
  check(toolName: string, toolArgs: Record<string, any>): PermissionDecision | null {
    const matchingRules = this.rules.filter((rule) => rule.enabled && this.matchesTool(rule.toolMatcher, toolName));

    for (const rule of matchingRules) {
      // Check if all conditions match
      let allConditionsMatch = true;
      for (const cond of rule.conditions) {
        if (!this.checkCondition(cond, toolName, toolArgs)) {
          allConditionsMatch = false;
          break;
        }
      }

      if (allConditionsMatch && rule.conditions.length > 0) {
        if (rule.action === "block") {
          return {
            result: PermissionResult.DENIED,
            reason: `Blocked by rule [${rule.name}]: ${rule.message}`,
          };
        } else if (rule.action === "warn" || rule.action === "ask") {
          return {
            result: PermissionResult.NEEDS_APPROVAL,
            approvalPrompt: `Rule Warning [${rule.name}]: ${rule.message}`,
          };
        }
      }
    }

    return null;
  }

  private matchesTool(matcher: string, toolName: string): boolean {
    if (matcher === "*") return true;
    const matchers = matcher.split("|").map((m) => m.trim().toLowerCase());
    return matchers.includes(toolName.toLowerCase());
  }

  private checkCondition(cond: RuleCondition, toolName: string, toolArgs: Record<string, any>): boolean {
    const value = this.extractField(cond.field, toolName, toolArgs);
    if (value === null) return false;

    const pattern = cond.pattern;
    switch (cond.operator) {
      case "regex_match":
        try {
          const regex = new RegExp(pattern, "i");
          return regex.test(value);
        } catch {
          return false;
        }
      case "contains":
        return value.toLowerCase().includes(pattern.toLowerCase());
      case "not_contains":
        return !value.toLowerCase().includes(pattern.toLowerCase());
      case "equals":
        return value.toLowerCase() === pattern.toLowerCase();
      case "starts_with":
        return value.toLowerCase().startsWith(pattern.toLowerCase());
      case "ends_with":
        return value.toLowerCase().endsWith(pattern.toLowerCase());
      default:
        return false;
    }
  }

  private extractField(field: string, toolName: string, toolArgs: Record<string, any>): string | null {
    if (field in toolArgs) {
      const val = toolArgs[field];
      return typeof val === "string" ? val : JSON.stringify(val);
    }

    const lowerField = field.toLowerCase();

    if (lowerField === "command" || lowerField === "commandline") {
      const val = toolArgs.command || toolArgs.CommandLine || toolArgs.cmd;
      return val ? String(val) : null;
    }

    if (lowerField === "file_path" || lowerField === "targetfile") {
      const val = toolArgs.file_path || toolArgs.TargetFile || toolArgs.filePath || toolArgs.path;
      return val ? String(val) : null;
    }

    if (lowerField === "content" || lowerField === "codecontent" || lowerField === "replacementcontent") {
      const val = toolArgs.content || toolArgs.CodeContent || toolArgs.ReplacementContent || toolArgs.text;
      return val ? String(val) : null;
    }

    return null;
  }
}
