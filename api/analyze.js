// 기획서 한 페이지를 Claude로 읽어 프로토타입 동작(툴팁·팝업·이동 등) 목록을 만든다.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const Rect = z.object({ l: z.number(), t: z.number(), w: z.number(), h: z.number() });
const Behavior = z.object({
  kind: z.enum(['tooltip', 'popup', 'dropdown', 'navigate', 'toggle', 'input']),
  trigger: z.enum(['click', 'hover']),
  rect: Rect,
  label: z.string(),
  content: z.string(),
  show_rect: Rect.nullable(),
  target_page: z.number().nullable(),
});
const Result = z.object({ behaviors: z.array(Behavior) });

const SYSTEM = `당신은 서비스 기획서(와이어프레임 + 디스크립션)를 읽고, 화면 목업을 "클릭해 볼 수 있는 프로토타입"으로 바꾸기 위한 동작 명세를 뽑는 분석가입니다.

입력: 기획서 한 페이지의 이미지, 페이지 제목, 디스크립션 텍스트 블록(좌표 포함), 이미 인식된 핫스팟 좌표, 문서의 전체 페이지 제목 목록.
좌표계: 페이지 전체 너비·높이에 대한 퍼센트(0~100). l=왼쪽, t=위, w=너비, h=높이.

찾아야 할 것 — 목업 안의 UI 요소 중, 디스크립션에 동작이 설명돼 있거나 화살표/연결선으로 결과 화면이 그려진 것:
- tooltip: 아이콘·요소 위에 올리거나 눌렀을 때 안내 문구가 뜨는 것. content에 실제 툴팁 문구를 넣는다.
- popup: 버튼을 누르면 모달·팝업·폼·시트가 뜨는 것. 그 결과 화면이 같은 페이지에 목업으로 그려져 있으면 show_rect에 그 목업의 영역(제목 캡션 제외, 박스만)을 넣고, content에는 디스크립션의 설명을 짧게 넣는다.
- dropdown: 선택 상자·메뉴를 눌렀을 때 아래로 펼쳐지는 것. popup과 같은 규칙.
- navigate: 눌렀을 때 다른 화면으로 이동하는 것. 이동할 화면이 문서 안 다른 페이지라면 target_page(1부터 시작)를 넣는다. 없으면 null.
- toggle: 켜고 끄는 스위치·체크·탭 전환. content에 ON/OFF 각각의 의미를 짧게.
- input: 입력창. content에 placeholder나 입력 제한 안내(글자 수 등).

규칙:
- rect는 목업 안 실제 UI 요소를 딱 맞게 감싼다(버튼 하나, 아이콘 하나). 디스크립션 표나 설명 영역을 rect로 잡지 않는다.
- 근거 없는 동작은 만들지 않는다. 디스크립션이나 화살표에 근거가 있는 것만.
- 한 페이지에 최대 12개. 같은 요소에 같은 종류의 동작을 중복하지 않는다.
- content는 한국어, 한두 문장. label은 요소 이름(예: "설정 아이콘", "보내기 버튼").
- 표지·개정이력·정책표처럼 화면 목업이 없는 페이지면 빈 배열을 돌려준다.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('Method Not Allowed'); }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.statusCode = 503;
    return res.end('서버에 ANTHROPIC_API_KEY가 설정되지 않았어요 (Vercel 프로젝트 환경변수에 추가해 주세요)');
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { res.statusCode = 400; return res.end('잘못된 요청이에요'); }

  const { image, pageIndex, title, pageTitles = [], blocks = [], hotspots = [] } = body || {};
  if (!image || typeof image !== 'string') { res.statusCode = 400; return res.end('페이지 이미지가 없어요'); }

  const r = (x) => ({ l: +x.l.toFixed(1), t: +x.t.toFixed(1), w: +x.w.toFixed(1), h: +x.h.toFixed(1) });
  const text = [
    `페이지 ${pageIndex + 1} 제목: ${title || '(없음)'}`,
    `문서 페이지 목록: ${pageTitles.map((t, i) => `${i + 1}. ${t || '(제목 없음)'}`).join(' / ')}`,
    '',
    '디스크립션 블록 (좌표%, 텍스트):',
    ...blocks.filter((b) => b.text).map((b) => `- rect=${JSON.stringify(r(b.rect))} caption="${b.caption || ''}"\n  ${String(b.text).replace(/\n/g, '\n  ').slice(0, 1500)}`),
    '',
    '인식된 핫스팟(빨간 점선) 좌표%:',
    ...hotspots.map((h) => `- rect=${JSON.stringify(r(h.rect))} label="${h.label || ''}"`),
    '',
    '이 페이지의 프로토타입 동작 목록을 만들어 주세요.',
  ].join('\n');

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { format: zodOutputFormat(Result), effort: 'medium' },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text },
        ],
      }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      res.statusCode = 502;
      return res.end('AI가 이 페이지를 분석하지 못했어요');
    }
    const clamp = (x) => ({
      l: Math.max(0, Math.min(100, x.l)), t: Math.max(0, Math.min(100, x.t)),
      w: Math.max(0.3, Math.min(100, x.w)), h: Math.max(0.3, Math.min(100, x.h)),
    });
    const behaviors = response.parsed_output.behaviors.slice(0, 12).map((b) => ({
      ...b, rect: clamp(b.rect), show_rect: b.show_rect ? clamp(b.show_rect) : null,
    }));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ behaviors, usage: response.usage }));
  } catch (e) {
    const status = e instanceof Anthropic.AuthenticationError ? 503
      : e instanceof Anthropic.RateLimitError ? 429 : 502;
    res.statusCode = status;
    res.end('AI 분석에 실패했어요: ' + (e && e.message ? e.message.slice(0, 200) : e));
  }
}
