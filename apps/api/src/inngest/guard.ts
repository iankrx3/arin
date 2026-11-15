import { NonRetriableError } from 'inngest';

/**
 * 키 한도로 막힌 호출은 다시 해도 결과가 같다. Inngest가 재시도하지 않게 한다.
 * 1·2번째 429(RATE_LIMITED)는 그대로 두어 3번까지는 시도한다.
 */
export async function guardBudget<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error && error.message.includes('[BUDGET_EXCEEDED]')) {
      throw new NonRetriableError(error.message);
    }
    throw error;
  }
}
