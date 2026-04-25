import { ReactNode } from 'react';
import './EmptyState.css';

interface Props {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
