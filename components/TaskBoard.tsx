import React from 'react';

export type TaskStatus = 'Active' | 'Done' | 'Blocked' | 'Pending';

export interface Task {
  id: string;
  title: string;
  description: string;
  agentName: string;
  agentIcon: string;
  status: TaskStatus;
}

interface Props {
  tasks: Task[];
}

export function TaskBoard({ tasks }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {tasks.map(task => {
        const isDone = task.status === 'Done';
        const isActive = task.status === 'Active';
        const isBlocked = task.status === 'Blocked';
        
        const topBorderColor = isDone ? 'border-t-primary' : isActive ? 'border-t-tertiary' : isBlocked ? 'border-t-error' : 'border-t-outline-variant';
        
        return (
          <div key={task.id} className={`bg-background neo-border p-5 neo-shadow border-t-8 ${topBorderColor} relative overflow-hidden transition-colors`}>
            {isActive && (
              <div className="absolute top-0 right-0 bg-tertiary text-on-tertiary px-3 py-1 font-headline text-xs font-bold uppercase border-l-4 border-b-4 border-primary z-10">Active</div>
            )}
            {isBlocked && (
              <div className="absolute top-0 right-0 bg-error text-on-error px-3 py-1 font-headline text-xs font-bold uppercase border-l-4 border-b-4 border-primary z-10">Blocked</div>
            )}
            <div className="flex justify-between items-start mb-4 mt-2">
              <h3 className="font-headline font-bold uppercase text-lg leading-tight w-4/5">{task.title}</h3>
              {isDone && (
                <span className="bg-surface-dim px-2 py-1 text-xs font-bold uppercase border-2 border-primary">Done</span>
              )}
            </div>
            <p className="font-body text-sm mb-4 text-on-surface-variant min-h-[40px]">{task.description}</p>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-outline-variant">
              <div className={`flex items-center gap-2 text-xs font-bold font-headline uppercase px-3 py-1.5 border-2 bg-surface-container ${
                isActive 
                  ? 'text-tertiary border-tertiary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' 
                  : isDone 
                  ? 'text-primary border-primary bg-surface' 
                  : 'text-on-surface-variant border-outline-variant'
              }`}>
                <span className="material-symbols-outlined text-sm">{task.agentIcon || 'smart_toy'}</span>
                <span>Assigned: {task.agentName}</span>
              </div>
              <span className="text-[10px] font-mono font-bold uppercase text-on-surface-variant bg-surface-container px-2 py-0.5 border border-outline-variant">
                ID: {task.id}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
