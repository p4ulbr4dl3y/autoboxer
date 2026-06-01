import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import CreateProjectModal from '../CreateProjectModal';
import { api } from '../../api/client';

// Mock the API client
vi.mock('../../api/client', () => ({
  api: {
    projects: {
      create: vi.fn().mockResolvedValue({ id: 1, name: 'New Project' }),
    },
  },
}));

describe('CreateProjectModal Component', () => {
  test('renders dialog elements when open', () => {
    render(<CreateProjectModal isOpen={true} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText('Create New Project')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Traffic Sign Detection')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Project description...')).toBeInTheDocument();
  });

  test('adds and removes classes from the form', () => {
    render(<CreateProjectModal isOpen={true} onClose={() => {}} onCreated={() => {}} />);
    
    // Default class input should be visible by its placeholder
    expect(screen.getAllByPlaceholderText('e.g. cat').length).toBe(1);

    // Add another class
    const addBtn = screen.getByText('Add Class');
    fireEvent.click(addBtn);
    expect(screen.getAllByPlaceholderText('e.g. cat').length).toBe(2);

    // Remove the class (index 1 has remove button, which is standard when length > 1)
    const removeBtn = screen.getAllByRole('button').find(btn => 
      btn.innerHTML.includes('M19 7l-.867 12.142A2 2 0 0116.138 21H7.862')
    );
    expect(removeBtn).toBeDefined();
    fireEvent.click(removeBtn!);
    expect(screen.getAllByPlaceholderText('e.g. cat').length).toBe(1);
  });

  test('validates that at least one class name is specified', async () => {
    render(<CreateProjectModal isOpen={true} onClose={() => {}} onCreated={() => {}} />);
    
    // Input name but leave class name blank
    const nameInput = screen.getByPlaceholderText('e.g. Traffic Sign Detection');
    fireEvent.change(nameInput, { target: { value: 'Test Project' } });
    
    const submitBtn = screen.getByText('Create');
    fireEvent.click(submitBtn);

    expect(screen.getByText('Please specify at least one class category.')).toBeInTheDocument();
  });

  test('calls API projects.create on successful submission', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    
    render(<CreateProjectModal isOpen={true} onClose={onClose} onCreated={onCreated} />);
    
    const nameInput = screen.getByPlaceholderText('e.g. Traffic Sign Detection');
    fireEvent.change(nameInput, { target: { value: 'Real Project' } });

    const classInput = screen.getByPlaceholderText('e.g. cat');
    fireEvent.change(classInput, { target: { value: 'cat' } });
    
    const submitBtn = screen.getByText('Create');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.projects.create).toHaveBeenCalledWith({
        name: 'Real Project',
        description: null,
        classes: [
          { name: 'cat', prompt: 'Locate cat.', color: '#34C759' }
        ]
      });
      expect(onClose).toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalled();
    });
  });
});
