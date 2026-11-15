/** 키 한도(429)를 이 횟수만큼 받은 뒤부터는 Gemini를 부르지 않는다. */
export const GEMINI_QUOTA_FAILURE_LIMIT = 3;

/** SDK가 다시 치는 일시 오류. 429(키 한도)는 넣지 않는다. 다시 쳐도 한도만 더 쓴다. */
export const GEMINI_RETRY_STATUS_CODES = [408, 500, 502, 503, 504] as const;

export function geminiQuotaBlockMessage(limit = GEMINI_QUOTA_FAILURE_LIMIT) {
  return `Gemini 한도 오류가 ${limit}번 나서 더 호출하지 않습니다`;
}

/**
 * 이 프로세스의 Gemini 호출이 429로 계속 실패할 때 센다.
 * 3번째 실패부터 막히고, 성공해도 풀리지 않는다. 서버를 다시 띄우면 0부터다.
 */
export function createGeminiQuotaBreaker(limit = GEMINI_QUOTA_FAILURE_LIMIT) {
  let failures = 0;
  return {
    isBlocked() {
      return failures >= limit;
    },
    /** 429 한 번을 기록한다. 이번으로 상한에 닿으면 true. */
    recordFailure() {
      failures += 1;
      return failures >= limit;
    },
  };
}
