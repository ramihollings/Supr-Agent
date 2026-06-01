import * as fs from 'fs';
import * as path from 'path';

export interface PermissionTier {
  level: number;
  name: string;
  allowedTools: string[];
}

export class PermissionEnforcer {
  private static tiers: PermissionTier[] = [];

  static {
    try {
      const configPath = path.resolve(process.cwd(), 'agent-config', 'permissions.json');
      const data = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(data);
      this.tiers = config.tiers || [];
    } catch (e) {
      console.warn("Failed to load permissions.json. Governance defaulting to strict deny-all.", e);
    }
  }

  /**
   * Validates if a requested tool is permitted at the current granted level.
   */
  static validate(grantedLevel: number, requestedTool: string): boolean {
    const allowedToolsForLevelAndBelow = this.tiers
      .filter(tier => tier.level <= grantedLevel)
      .flatMap(tier => tier.allowedTools);

    return allowedToolsForLevelAndBelow.includes(requestedTool);
  }

  /**
   * Generates a dynamic payload representing the current permissions to pass to external tools.
   */
  static getPayloadForTier(tierName: string) {
    const tier = this.tiers.find(t => t.name.toLowerCase() === tierName.toLowerCase());
    if (!tier) throw new Error(`Unknown permission tier: ${tierName}`);
    return {
      level: tier.level,
      name: tier.name,
      tools: this.tiers.filter(t => t.level <= tier.level).flatMap(t => t.allowedTools)
    };
  }
}
