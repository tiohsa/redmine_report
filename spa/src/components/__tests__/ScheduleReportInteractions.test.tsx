import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FilterToolbar } from '../FilterToolbar';

describe('FilterToolbar', () => {
  it('renders months selector', () => {
    render(<FilterToolbar />);
    expect(screen.getByLabelText('Months')).toBeTruthy();
  });
});
