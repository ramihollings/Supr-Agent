import React from 'react';

export interface ActivityEvent {
  id: string;
  agentName: string;
  action: string;
  status: 'Pending' | 'Running' | 'Success' | 'Failed' | 'Waiting for Input';
  timestamp: string;
  errorMessage?: string;
}

interface AgentActivityLogProps {
  events: ActivityEvent[];
}

export function AgentActivityLog({ events }: AgentActivityLogProps) {
  const getStatusColor = (status: ActivityEvent['status']) => {
    switch (status) {
      case 'Success': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'Failed': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'Running': return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20 animate-pulse';
      case 'Waiting for Input': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-xl">
      <div className="p-4 border-b border-neutral-800 bg-neutral-950">
        <h2 className="text-lg font-semibold text-neutral-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Agent Activity Log
        </h2>
      </div>
      
      <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="text-center text-neutral-500 py-8">No activity recorded yet.</div>
        ) : (
          events.map((event, index) => (
            <div key={event.id} className="relative pl-6 pb-4 last:pb-0">
              {/* Timeline Line */}
              {index !== events.length - 1 && (
                <div className="absolute left-[11px] top-6 bottom-0 w-[2px] bg-neutral-800"></div>
              )}
              
              {/* Timeline Dot */}
              <div className="absolute left-0 top-1.5 w-[24px] h-[24px] rounded-full bg-neutral-900 border-2 border-neutral-700 flex items-center justify-center z-10">
                 <div className={`w-2 h-2 rounded-full ${getStatusColor(event.status).split(' ')[1]}`}></div>
              </div>

              <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-md p-3 ml-2 hover:bg-neutral-800 transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-200">{event.agentName}</span>
                    <span className="text-xs text-neutral-500">{event.timestamp}</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(event.status)}`}>
                    {event.status}
                  </span>
                </div>
                
                <p className="text-sm text-neutral-400 mt-1">{event.action}</p>
                
                {event.status === 'Failed' && event.errorMessage && (
                  <div className="mt-2 p-2 rounded bg-red-950/30 border border-red-900/50">
                    <p className="text-xs text-red-400 font-mono">Error: {event.errorMessage}</p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
