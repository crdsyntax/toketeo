import { render, screen } from '@testing-library/react';
import { SqlGeneratorModal } from './SqlGeneratorModal';
import { describe, it, expect } from 'vitest';

describe('SqlGeneratorModal', () => {
  it('renders correctly', () => {
    render(<SqlGeneratorModal isOpen={true} onClose={() => {}} initialSql="SELECT * FROM table" />);
    expect(screen.getByText('SQL Generator')).toBeDefined();


    const textarea = screen.getByRole('textbox');
    expect((textarea as HTMLTextAreaElement).value).toBe("SELECT * FROM table");
  });
});
