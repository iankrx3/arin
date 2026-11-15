import { describe, expect, it } from 'vitest';
import {
  ARIN_BODY_MAX,
  ARIN_BODY_MIN,
  ARIN_SENTENCE_MAX,
  arinStorySchema,
  recentLineFromStory,
  sampleArinStory,
  splitSentences,
} from './arin-story';

describe('arinStorySchema', () => {
  it('예시 이야기는 통과하고 본문은 검사 범위 안이다', () => {
    const story = sampleArinStory();
    expect(arinStorySchema.safeParse(story).success).toBe(true);
    const compact = story.paragraphs.flat().join('').replace(/\s/g, '').length;
    expect(compact).toBeGreaterThanOrEqual(ARIN_BODY_MIN);
    expect(compact).toBeLessThanOrEqual(ARIN_BODY_MAX);
  });

  it('조금 벗어난 글은 받는다: 따옴표 없는 끝, 목록 밖 값, 확언 4개, 60자 넘는 문장', () => {
    const story = sampleArinStory();
    story.paragraphs[story.paragraphs.length - 1] = ['나는 이미 이 하루 안에 있다.'];
    story.paragraphs[0] = ['가'.repeat(100)];
    const loose = {
      ...story,
      theme: '여유',
      image_hint: 'beach',
      affirmations: [...story.affirmations, '넷째 확언.'],
    };
    const parsed = arinStorySchema.safeParse(loose);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.theme).toBe('기타');
    expect(parsed.data.image_hint).toBe('cafe');
    expect(parsed.data.affirmations).toHaveLength(3);
  });

  it('여러 문장이 한 항목이거나 3문장을 넘는 문단은 나눈다', () => {
    expect(splitSentences('나는 창을 연다. 빛이 들어온다. 커피가 식기 전에.')).toHaveLength(3);
    const story = sampleArinStory();
    story.paragraphs[1] = ['하나. 둘.', '셋.', '넷.'];
    const parsed = arinStorySchema.safeParse(story);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.paragraphs[1]).toEqual(['하나.', '둘.', '셋.']);
    expect(parsed.data.paragraphs[2]).toEqual(['넷.']);
  });

  it('본문이 너무 짧거나 문장이 지나치게 길거나 확언이 모자라면 거절한다', () => {
    const short = sampleArinStory();
    short.paragraphs = short.paragraphs.slice(0, 8);
    expect(arinStorySchema.safeParse(short).success).toBe(false);

    const long = sampleArinStory();
    long.paragraphs[0] = ['가'.repeat(ARIN_SENTENCE_MAX + 1)];
    expect(arinStorySchema.safeParse(long).success).toBe(false);

    const few = { ...sampleArinStory(), affirmations: ['하나.', '둘.'] };
    expect(arinStorySchema.safeParse(few).success).toBe(false);
  });
});

describe('recentLineFromStory', () => {
  it('제목, 따옴표 대사, 마지막 확언을 한 줄로 잇는다', () => {
    expect(
      recentLineFromStory({
        title: '청담의 아침',
        script: '창을 연다.\n\n"오늘은 내 거야." 라고 말한다.',
        affirmations: ['처음', '마지막 확언'],
      }),
    ).toBe('청담의 아침 오늘은 내 거야. 마지막 확언');
  });
});
