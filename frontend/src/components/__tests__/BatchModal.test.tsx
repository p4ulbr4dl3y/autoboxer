import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import BatchModal from '../BatchModal';
import type { ClassCategory, ProjectStats } from '../../types';

describe('BatchModal Component', () => {
  const mockClasses: ClassCategory[] = [
    { id: 1, name: 'cat', color: '#FF0000', prompt: 'Locate cats.', created_at: '' },
    { id: 2, name: 'dog', color: '#00FF00', prompt: 'Locate dogs.', created_at: '' },
  ];

  const mockStats: ProjectStats = {
    project_id: 1,
    name: 'Test Project',
    total_images: 10,
    unlabeled_images: 6,
    labeled_images: 4,
    in_progress_images: 0,
    batch_in_progress: false,
  };

  test('renders with classes and settings options', () => {
    render(
      <BatchModal
        isOpen={true}
        classes={mockClasses}
        stats={mockStats}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    expect(screen.getByText('AI Grounding Project')).toBeInTheDocument();
    expect(screen.getByText('Unlabeled Only')).toBeInTheDocument();
    expect(screen.getByText('6 images left')).toBeInTheDocument();
    expect(screen.getByText('All Images')).toBeInTheDocument();
    expect(screen.getByText('10 images total')).toBeInTheDocument();
    expect(screen.getByText('cat')).toBeInTheDocument();
    expect(screen.getByText('dog')).toBeInTheDocument();
  });

  test('enables select all and clear classes', () => {
    render(
      <BatchModal
        isOpen={true}
        classes={mockClasses}
        stats={mockStats}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    const checkCat = screen.getByLabelText('cat') as HTMLInputElement;
    const checkDog = screen.getByLabelText('dog') as HTMLInputElement;
    
    // By default, all classes are selected
    expect(checkCat.checked).toBe(true);
    expect(checkDog.checked).toBe(true);

    // Click "Clear"
    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);
    expect(checkCat.checked).toBe(false);
    expect(checkDog.checked).toBe(false);

    // Click "Select All"
    const selectAllBtn = screen.getByText('Select All');
    fireEvent.click(selectAllBtn);
    expect(checkCat.checked).toBe(true);
    expect(checkDog.checked).toBe(true);
  });

  test('disables unlabeled button if stats show 0 unlabeled images remaining', () => {
    const zeroUnlabeledStats = { ...mockStats, unlabeled_images: 0 };
    render(
      <BatchModal
        isOpen={true}
        classes={mockClasses}
        stats={zeroUnlabeledStats}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    const unlabeledBtn = screen.getByText('Unlabeled Only').closest('button');
    expect(unlabeledBtn).toBeDisabled();
  });

  test('submits configuration options on confirmation', () => {
    const onConfirm = vi.fn();
    render(
      <BatchModal
        isOpen={true}
        classes={mockClasses}
        stats={mockStats}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );

    // Toggle target to 'All Images'
    const allImagesBtn = screen.getByText('All Images').closest('button');
    fireEvent.click(allImagesBtn!);

    // Toggle conflict resolution to 'Overwrite'
    const overwriteBtn = screen.getByText('Overwrite').closest('button');
    fireEvent.click(overwriteBtn!);

    // Submit form
    const submitBtn = screen.getByText('Start Grounding');
    fireEvent.click(submitBtn);

    expect(onConfirm).toHaveBeenCalledWith({
      target_images: 'all',
      mode: 'overwrite',
      target_classes: ['cat', 'dog']
    });
  });
});
