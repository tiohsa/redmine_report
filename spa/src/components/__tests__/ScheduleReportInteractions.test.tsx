import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilterToolbar } from '../FilterToolbar';

describe('FilterToolbar', () => {
  it('renders view mode selector', () => {
    render(<FilterToolbar />);
    expect(screen.getByText('View:')).toBeTruthy();
    expect(screen.getByText('Month')).toBeTruthy();
  });
});
