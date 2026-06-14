import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatPanel } from './StatPanel';
import type { SidebarRow } from '../../../shared/dto';

describe('StatPanel', () => {
  it('renders headers, stat rows, and spacers from engine output', () => {
    const rows: SidebarRow[] = [
      { header: '^7Life:' },
      { label: 'Life:', value: '^x88FF881187' },
      { spacer: true },
      { label: 'Energy Shield:', value: '0' },
    ];
    const { container } = render(<StatPanel rows={rows} warnings={['^1watch out']} />);
    expect(screen.getByText('Life:', { selector: '.pob-stat-head span span' })).toBeInTheDocument();
    expect(screen.getByText('1187')).toBeInTheDocument();
    expect(container.querySelectorAll('.pob-stat-row').length).toBe(2);
    expect(container.querySelector('.pob-stat-gap')).toBeInTheDocument();
    expect(screen.getByText('watch out')).toBeInTheDocument();
  });
});
