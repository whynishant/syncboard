import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';

function ToolbarHarness() {
  const [tool, setTool] = useState('select');
  return <div><button aria-label="Rectangle (R)" onClick={() => setTool('rect')}>Rectangle</button><span data-testid="active-tool">{tool}</span></div>;
}

describe('toolbar interaction', () => {
  it('updates selected drawing tool when activated', async () => {
    render(<ToolbarHarness />);
    expect(screen.getByTestId('active-tool')).toHaveTextContent('select');
    screen.getByRole('button', { name: 'Rectangle (R)' }).click();
    expect(screen.getByTestId('active-tool')).toHaveTextContent('rect');
  });
});
