import { describe, it, expect } from 'vitest';
import { generateWithModelFallback } from '../services/aiService';

describe('AI Service', () => {
  it('should return null when model fails', async () => {
    const result = await generateWithModelFallback({ contents: [] });
    expect(result).toBeNull();
  });
});
