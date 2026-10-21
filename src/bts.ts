import { evaluateInBts } from './cdp.js';
import { agentCall, type AgentStatus, type Leaf, type WriteChange } from './page-agent.js';

export interface BtsClient {
  status(): Promise<AgentStatus>;
  index(): Promise<Leaf[]>;
  read(pids: string[]): Promise<Record<string, number>>;
  write(changes: WriteChange[]): Promise<Record<string, number>>;
}

export function createCdpBts(port = 9222): BtsClient {
  let leaves: Leaf[] | undefined; // the address map is static per BTS version
  return {
    status: () => evaluateInBts(agentCall('status'), port),
    index: async () => (leaves ??= await evaluateInBts<Leaf[]>(agentCall('index'), port)),
    read: pids => evaluateInBts(agentCall('read', pids), port),
    write: changes => evaluateInBts(agentCall('write', changes), port),
  };
}
