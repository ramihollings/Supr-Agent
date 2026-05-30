import dbClient from '@/lib/database/db_client';

export async function buildSubagentContext(agentId: string) {
  const agent = await dbClient.queryOne<any>(`SELECT * FROM Agents WHERE id = ?`, [agentId]);
  const capabilities = await dbClient.query<any>(
    `SELECT c.* FROM Capabilities c
     INNER JOIN Agent_Capabilities ac ON ac.capability_id = c.id
     WHERE ac.agent_id = ? AND ac.allowed = 1
     ORDER BY c.name ASC`,
    [agentId],
  );

  return {
    agent: agent ? {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      permissionTier: agent.permission_tier,
    } : null,
    tools: capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      requiredPermission: capability.required_permission,
      riskLevel: capability.risk_level,
      description: capability.description,
    })),
    systemReminder: 'Use only the tools listed in this context. Request approval for any missing or higher-risk capability.',
  };
}
