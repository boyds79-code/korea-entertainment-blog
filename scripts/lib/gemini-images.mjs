// Gemini API로 AI 이미지를 자동 생성하는 모듈.
//
// generate-post.mjs가 Claude로부터 받은 image_plan(각 이미지의 ai_prompt)을 가지고
// 이 모듈을 호출해 실제 이미지 파일을 만들어서 public/images/blog/<slug>/ 에 저장합니다.
// GEMINI_API_KEY가 없거나, 특정 이미지 생성이 실패(네트워크 오류, 안전 필터 차단 등)하면
// 그 이미지만 조용히 실패 처리하고 null을 반환합니다 — 글 생성 자체가 이미지 때문에
// 실패해서는 안 되기 때문에, 실패한 이미지는 기존처럼 "직접 만들어서 넣어주세요"
// 체크리스트로 남습니다 (add-photos.mjs / README 참고).
//
// TODO: 이 API는 계속 바뀌는 영역입니다. 아래 엔드포인트/모델명이 에러를 내면
// https://ai.google.dev/gemini-api/docs/image-generation 문서에서 최신 사양을 확인하고
// API_URL / MODEL / 요청·응답 필드명을 갱신해주세요.
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_MODEL = 'gemini-3.1-flash-image';

/**
 * 텍스트 프롬프트 하나로 이미지 한 장을 생성해서 Buffer로 돌려줍니다.
 * 실패하면(키 없음, API 에러, 안전 필터 차단 등) null을 반환합니다 — 절대 throw하지 않습니다.
 */
export async function generateImage({ prompt, apiKey, model }) {
  apiKey = apiKey?.trim();
  if (!apiKey) return null;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        input: [{ type: 'text', text: prompt }],
        response_format: {
          type: 'image',
          mime_type: 'image/jpeg',
          aspect_ratio: '4:3',
          image_size: '1K',
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[gemini-images] 이미지 생성 실패 (${res.status}): ${text.slice(0, 300)}`);
      return null;
    }

    const data = await res.json();
    // Interactions API 응답 구조가 몇 차례 바뀌었습니다. 아래는 알려진 형태들을 순서대로 시도합니다:
    // 1) 최상위 output_image.data (SDK 편의 프로퍼티 방식)
    // 2) { interaction: { output_image: { data } } } (구버전 래핑 형태)
    // 3) steps[].content[] 안에서 type:"image"인 항목의 data (2026-05 이후 steps 배열 방식)
    // 4) candidates[].content.parts[].inlineData.data (구 generateContent 방식, 혹시 몰라 유지)
    const imageFromSteps = Array.isArray(data?.steps)
      ? data.steps
          .flatMap((s) => (Array.isArray(s?.content) ? s.content : []))
          .find((c) => c?.type === 'image')?.data
      : undefined;

    const base64 =
      data?.output_image?.data ||
      data?.interaction?.output_image?.data ||
      imageFromSteps ||
      data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;

    if (!base64) {
      console.warn('[gemini-images] 응답에서 이미지 데이터를 찾지 못했습니다:', JSON.stringify(data).slice(0, 800));
      return null;
    }

    return Buffer.from(base64, 'base64');
  } catch (err) {
    console.warn('[gemini-images] 이미지 생성 중 오류:', err.message);
    return null;
  }
}
