import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import ConfirmModal from '../ConfirmModal';

describe('ConfirmModal Component', () => {
  test('does not render when isOpen is false', () => {
    const { container } = render(
      <ConfirmModal
        isOpen={false}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders modal when isOpen is true', () => {
    render(
      <ConfirmModal
        isOpen={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('calls onConfirm and onClose when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    
    render(
      <ConfirmModal
        isOpen={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
    
    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);
    
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when cancel button is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    
    render(
      <ConfirmModal
        isOpen={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
    
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when clicking close SVG button', () => {
    const onClose = vi.fn();
    
    render(
      <ConfirmModal
        isOpen={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={() => {}}
        onClose={onClose}
      />
    );
    
    const closeBtn = screen.getByLabelText('Close dialog');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    
    render(
      <ConfirmModal
        isOpen={true}
        title="Delete Item"
        message="Are you sure?"
        onConfirm={() => {}}
        onClose={onClose}
      />
    );
    
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
