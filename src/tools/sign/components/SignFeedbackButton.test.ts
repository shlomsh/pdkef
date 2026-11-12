import { describe, expect, it } from 'vitest';
import { signFeedbackUrl } from './SignFeedbackButton.tsx';

describe('signFeedbackUrl', () => {
  it('titles the issue for Sign and carries the detection line only when given', () => {
    const plain = new URL(signFeedbackUrl(null));
    expect(plain.searchParams.get('title')).toBe('[Sign & Fill PDF] Bug report or feedback');
    expect(plain.searchParams.get('body')).not.toContain('TypeError: x');
    expect(new URL(signFeedbackUrl('TypeError: x')).searchParams.get('body')).toContain('TypeError: x');
  });
});
