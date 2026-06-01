import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Header from '../Header';

describe('Header Component', () => {
  test('renders logo title', () => {
    render(
      <MemoryRouter>
        <Header view="dashboard" selectedProjectId={null} />
      </MemoryRouter>
    );
    expect(screen.getByText('Autoboxer')).toBeInTheDocument();
  });

  test('does not render gallery link when selectedProjectId is null', () => {
    render(
      <MemoryRouter>
        <Header view="dashboard" selectedProjectId={null} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Gallery')).not.toBeInTheDocument();
  });

  test('renders gallery link when selectedProjectId is provided', () => {
    render(
      <MemoryRouter>
        <Header view="dashboard" selectedProjectId={123} />
      </MemoryRouter>
    );
    const galleryLink = screen.getByText('Gallery');
    expect(galleryLink).toBeInTheDocument();
    expect(galleryLink.getAttribute('href')).toBe('/projects/123');
  });

  test('highlights the active link according to the view prop', () => {
    render(
      <MemoryRouter>
        <Header view="dashboard" selectedProjectId={123} />
      </MemoryRouter>
    );
    
    const dashboardLink = screen.getByText('Dashboard');
    expect(dashboardLink.className).toContain('bg-slate-850');
    
    const galleryLink = screen.getByText('Gallery');
    expect(galleryLink.className).not.toContain('bg-slate-850');
  });
});
