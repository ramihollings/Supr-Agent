import React from 'react';

export interface ApprovalRequest {
  id: string;
  requestingAgent: string;
  action: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  permission: string;
  reason: string;
  suprRecommendation: string;
}

interface Props {
  request: ApprovalRequest;
  onDecision: (id: string, decision: 'approve' | 'reject' | 'revise') => void;
}

export function InlineApproval({ request, onDecision }: Props) {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'High':
      case 'Critical': return 'text-red-500 border-red-500 bg-red-500/10';
      case 'Medium': return 'text-amber-500 border-amber-500 bg-amber-500/10';
      default: return 'text-primary border-primary bg-primary/10';
    }
  };

  return (
    <div className="neo-border p-4 bg-surface-variant border-l-4 border-l-secondary my-2">
      <div className="flex justify-between items-start mb-3 border-b border-outline-variant pb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-base">security</span>
          <span className="font-headline font-black uppercase text-sm text-secondary">Approval Gate</span>
        </div>
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 border ${getRiskColor(request.riskLevel)}`}>
          {request.riskLevel} Risk
        </span>
      </div>
      
      <div className="space-y-2 mb-4">
        <p className="text-sm"><strong className="font-headline uppercase text-xs text-on-surface-variant">Action:</strong> {request.action}</p>
        <p className="text-sm"><strong className="font-headline uppercase text-xs text-on-surface-variant">Agent:</strong> {request.requestingAgent}</p>
        <p className="text-sm"><strong className="font-headline uppercase text-xs text-on-surface-variant">Reason:</strong> {request.reason}</p>
        <div className="p-3 bg-background neo-border mt-3">
          <p className="text-sm text-on-surface-variant"><strong className="font-headline uppercase text-tertiary">Supr Rec:</strong> {request.suprRecommendation}</p>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={() => onDecision(request.id, 'approve')} className="flex-1 bg-secondary text-on-secondary neo-border py-2 text-xs font-headline font-bold uppercase hover:bg-secondary-fixed hover:text-secondary transition-colors">Approve</button>
        <button onClick={() => onDecision(request.id, 'revise')} className="flex-1 bg-surface text-on-surface neo-border py-2 text-xs font-headline font-bold uppercase hover:bg-surface-bright transition-colors">Revise</button>
        <button onClick={() => onDecision(request.id, 'reject')} className="flex-1 bg-error text-on-error neo-border py-2 text-xs font-headline font-bold uppercase hover:bg-red-600 transition-colors">Reject</button>
      </div>
    </div>
  );
}
