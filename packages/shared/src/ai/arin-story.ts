import { z } from 'zod';

/**
 * 인수인계 9번의 이야기 JSON.
 * 저장 전에 이 스키마로 검사하고, 어긋나면 어댑터가 한 번만 다시 생성한다.
 * 이름 횟수(사물·장소 3번, 사람 10~14)는 고유명사를 안정적으로 셀 수 없어 여기서 막지 않는다.
 */
export const IMAGE_HINTS = [
  'penthouse',
  'dressroom',
  'contract',
  'cafe',
  'coffee',
  'dinner',
  'wedding',
  'paris',
  'jeju',
  'yoga',
  'brunch',
  'drive',
] as const;

export type ImageHint = (typeof IMAGE_HINTS)[number];

export const ARIN_THEMES = [
  '합격',
  '내집',
  '커리어',
  '돈',
  '차',
  '사랑',
  '결혼',
  '건강',
  '여행',
  '자신감',
  '기타',
] as const;

export type ArinTheme = (typeof ARIN_THEMES)[number];

/*
 * 저장 전 검사 범위(D-54). 프롬프트(9절)는 16~20문단·1,400~1,600자·문장 60자를 요구하지만,
 * 검사는 그보다 넓게 받아 조금 벗어난 글로 생성 전체가 실패하지 않게 한다.
 * 본문 상한 2,000자(공백 제외)는 공백 포함 약 2,450자로 음성 회당 크레딧 상한 안에 들게 둔 값이다.
 */
export const ARIN_PARAGRAPHS_MIN = 10;
export const ARIN_PARAGRAPHS_MAX = 26;
/** 문단 하나의 문장 수. 넘는 문단은 거절하지 않고 이 수만큼씩 나눈다. */
export const ARIN_SENTENCES_PER_PARAGRAPH = 3;
export const ARIN_SENTENCE_MAX = 160;
export const ARIN_TITLE_MAX = 50;
export const ARIN_AFFIRMATION_MAX = 80;
export const ARIN_AFFIRMATION_COUNT = 3;
/** 모델이 확언을 더 주면 앞의 3개만 쓴다. */
export const ARIN_AFFIRMATION_INPUT_MAX = 6;
/** 문단 문장을 이어 공백을 뺀 본문 길이. */
export const ARIN_BODY_MIN = 1000;
export const ARIN_BODY_MAX = 2000;
/** 모델이 목록 밖 값을 주면 쓰는 값. */
export const ARIN_THEME_FALLBACK = '기타';
export const ARIN_IMAGE_HINT_FALLBACK = 'cafe';

/** 문단을 문장으로 나눈다. 마침표·물음표·느낌표·말줄임 뒤의 공백이 경계다. */
export function splitSentences(paragraph: string): string[] {
  const parts = paragraph
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [paragraph.trim()];
}

/**
 * 모델이 준 문단을 정리한다. 한 항목에 여러 문장이 들어 있으면 나누고, 빈 문장·빈 문단은 버리고,
 * 3문장을 넘는 문단은 3문장씩 나눈다. 자막이 문장 단위라 문장 경계만 맞추면 된다.
 */
export function normalizeArinParagraphs(paragraphs: readonly (readonly string[])[]): string[][] {
  const out: string[][] = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph
      .flatMap((item) => splitSentences(item))
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (let i = 0; i < sentences.length; i += ARIN_SENTENCES_PER_PARAGRAPH) {
      out.push(sentences.slice(i, i + ARIN_SENTENCES_PER_PARAGRAPH));
    }
  }
  return out;
}

/** 공백을 뺀 본문 글자 수. */
export function arinBodyLength(paragraphs: readonly (readonly string[])[]): number {
  return paragraphs.flat().join('').replace(/\s/g, '').length;
}

/**
 * 이야기 JSON 검사(D-54). 모델에 보내는 JSON Schema는 정리 전 모양(io: input)이다.
 * 거절하는 것: 제목·문단이 비었을 때, 정리 후 문단 수·본문 길이·문장 길이가 범위 밖일 때, 확언이 3개 미만일 때.
 * 거절하지 않는 것: 마지막 문단의 따옴표, 목록 밖 theme·image_hint(기본값으로), 문단당 문장 수.
 */
export const arinStorySchema = z
  .object({
    title: z.string().trim().min(1).max(ARIN_TITLE_MAX),
    theme: z.enum(ARIN_THEMES).catch(ARIN_THEME_FALLBACK),
    image_hint: z.enum(IMAGE_HINTS).catch(ARIN_IMAGE_HINT_FALLBACK),
    paragraphs: z.array(z.array(z.string())).min(1),
    affirmations: z
      .array(z.string().trim().min(1).max(ARIN_AFFIRMATION_MAX))
      .min(ARIN_AFFIRMATION_COUNT)
      .max(ARIN_AFFIRMATION_INPUT_MAX),
  })
  .transform((story) => ({
    ...story,
    paragraphs: normalizeArinParagraphs(story.paragraphs),
    affirmations: story.affirmations.slice(0, ARIN_AFFIRMATION_COUNT),
  }))
  .superRefine((story, ctx) => {
    const count = story.paragraphs.length;
    if (count < ARIN_PARAGRAPHS_MIN || count > ARIN_PARAGRAPHS_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['paragraphs'],
        message: `문단 ${count}개(${ARIN_PARAGRAPHS_MIN}~${ARIN_PARAGRAPHS_MAX})`,
      });
    }
    story.paragraphs.forEach((paragraph, p) =>
      paragraph.forEach((sentence, s) => {
        if (sentence.length > ARIN_SENTENCE_MAX) {
          ctx.addIssue({
            code: 'custom',
            path: ['paragraphs', p, s],
            message: `문장 ${sentence.length}자(최대 ${ARIN_SENTENCE_MAX})`,
          });
        }
      }),
    );
    const body = arinBodyLength(story.paragraphs);
    if (body < ARIN_BODY_MIN || body > ARIN_BODY_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['paragraphs'],
        message: `본문 공백 제외 ${body}자(${ARIN_BODY_MIN}~${ARIN_BODY_MAX})`,
      });
    }
  });

export type ArinStory = z.output<typeof arinStorySchema>;

/** 음성에 넣을 본문. 한 문단의 문장은 이어 읽고, 문단 사이 빈 줄만 쉼이다. */
export function scriptFromArinStory(story: { paragraphs: readonly (readonly string[])[] }): string {
  return story.paragraphs.map((paragraph) => paragraph.join(' ')).join('\n\n');
}

/**
 * arin_story 컬럼이 없는 예전 이야기를 수정 요청에 넘길 때 쓴다.
 * 스키마를 통과하지 않아도 모델이 이전 글을 보게만 한다.
 */
export function fallbackArinStoryJson(input: {
  title: string | null;
  script: string | null;
  imageHint: string | null;
  affirmations: readonly string[] | null;
}) {
  const paragraphs = (input.script ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => splitSentences(paragraph))
    .filter((sentences) => sentences.some((sentence) => sentence.length > 0));
  return {
    title: input.title ?? '',
    theme: '기타' as const,
    image_hint: input.imageHint,
    paragraphs,
    affirmations: [...(input.affirmations ?? [])],
  };
}

/** 최근 이야기에서 반복을 피하려고 넣는 한 줄: 제목, 따옴표 대사, 마지막 확언. */
export function recentLineFromStory(story: {
  title: string | null;
  script: string | null;
  affirmations: readonly string[] | null;
}): string {
  const quotes = [...(story.script ?? '').matchAll(/["“「『]([^"”」』\n]{1,80})["”」』]/g)].map(
    (m) => m[1] ?? '',
  );
  return [story.title ?? '', ...quotes, story.affirmations?.at(-1) ?? ''].filter(Boolean).join(' ');
}

const SAMPLE_SENSES = [
  '나는 따뜻한 아침 빛 속에서 이 소원이 남긴 결을 손끝으로 천천히 느낀다.',
  '나는 창가에 앉아 이 소원이 바꾼 공기의 온기를 천천히 들이마신다.',
  '나는 그 결을 손바닥에 올리고 마음이 조용히 차오르는 것을 느낀다.',
] as const;

/**
 * 스키마를 통과하는 결정적 예시. mock 어댑터와 테스트가 같이 쓴다.
 * 17문단 × 3문장(공백 제외 86자) + 확언 한 문장 = 1,476자.
 */
export function sampleArinStory(): ArinStory {
  const paragraphs: string[][] = Array.from({ length: 17 }, () => [...SAMPLE_SENSES]);
  paragraphs.push(['"나는 이미 이 하루 안에 있다."']);
  return {
    title: '빛의 아침\n창을 연다',
    theme: '기타',
    image_hint: 'cafe',
    paragraphs,
    affirmations: ['나는 여기 있다.', '나는 충분하다.', '나는 천천히 간다.'],
  };
}
