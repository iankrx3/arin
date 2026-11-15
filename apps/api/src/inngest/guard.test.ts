import { NonRetriableError } from 'inngest';
import { describe, expect, it } from 'vitest';
import { guardBudget } from './guard';

describe('guardBudget', () => {
  it('한도 차단은 다시 시도하지 않는다', async () => {
    await expect(
      guardBudget(async () => {
        throw new Error('[BUDGET_EXCEEDED] Gemini 한도 오류가 3번 나서 더 호출하지 않습니다');
      }),
    ).rejects.toBeInstanceOf(NonRetriableError);
  });

  it('1·2번째 한도 오류는 재시도할 수 있게 둔다', async () => {
    const error = await guardBudget(async () => {
      throw new Error('[RATE_LIMITED] gemini 429');
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(NonRetriableError);
  });
});
