// AI-powered book topic classification for MindMap.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 요청만 지원해." });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "서버에 API 키가 설정되지 않았어." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const books = Array.isArray(body.books) ? body.books.slice(0, 30).map((b, i) => ({
      id: String(b.id ?? i),
      title: String(b.title || "").slice(0, 160),
      subtitle: String(b.subtitle || "").slice(0, 240),
      author: String(b.author || "").slice(0, 120),
      classification: String(b.classification || "").slice(0, 24)
    })).filter(b => b.title) : [];
    if (!books.length) return res.status(400).json({ error: "분류할 도서 목록이 없어." });

    const categories = [
      "AI·디지털", "경제·금융", "사회·정치", "역사·세계",
      "마음·관계", "성장·삶", "철학·윤리", "과학·자연",
      "환경·생태", "건강·몸", "예술·문화", "여행·공간",
      "문학·이야기", "언어", "종교·신앙", "기타·분류 보류"
    ];
    const instructions = [
      "너는 도서관의 도서 주제 분류 전문가다.",
      "각 책을 제공된 정보만으로 판단해 가장 적절한 주제 하나에 분류한다.",
      "책 제목의 단어 하나만 보고 판단하지 말고 제목, 부제, 저자, 한국십진분류법 분류번호를 함께 고려한다.",
      "분류번호는 보조 정보일 뿐이며 첫 숫자만으로 기계적으로 분류하지 않는다.",
      "소설, 동화, 만화, 시, 수필 등 문학 작품은 여행이나 사회 같은 단어가 제목에 있더라도 작품 자체가 문학이면 '문학·이야기'로 분류한다.",
      "'환경·생태'는 환경오염, 기후위기, 생태계, 생물다양성, 환경보호가 핵심 주제인 책에 사용한다. 일반 자연과학·동식물 소개는 '과학·자연'로 분류한다.",
      "'철학·윤리'는 철학적 사유, 윤리, 정의, 존재, 사상 등을 중심으로 다루는 책에 사용한다.",
      "'사회·정치'는 사회구조, 정치, 법, 인권, 노동, 국제관계 등을 중심으로 다루는 책에 사용한다.",
      "'마음·관계'는 심리, 감정, 대인관계, 가족, 소통 등을 중심으로 다루는 책에 사용한다.",
      "여러 주제가 섞이면 책의 주된 목적과 핵심 내용을 기준으로 하나만 선택한다.",
      "제공된 정보만으로 주제를 신뢰성 있게 판단하기 어려우면 '기타·분류 보류'를 선택한다.",
      "입력된 모든 id에 대해 정확히 하나의 결과를 반환하고, id를 바꾸거나 누락하지 않는다."
    ].join("\n");

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              category: { type: "string", enum: categories }
            },
            required: ["id", "category"]
          }
        }
      },
      required: ["items"]
    };

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions,
        input: "다음 도서들을 각각 하나의 주제로 분류해 줘.\n" + JSON.stringify(books),
        text: { format: { type: "json_schema", name: "book_topic_classification", strict: true, schema } },
        max_output_tokens: 1800,
        store: false
      })
    });
    const payload = await upstream.json();
    if (!upstream.ok) {
      console.error("OpenAI classification error:", upstream.status);
      return res.status(502).json({ error: "AI 도서 분류 요청에 실패했어. 잠시 뒤 다시 시도해 줘." });
    }
    const output = typeof payload.output_text === "string" ? payload.output_text :
      (payload.output || []).flatMap(item => item.content || []).filter(c => c.type === "output_text").map(c => c.text).join("\n");
    if (!output) return res.status(502).json({ error: "AI 분류 결과가 비어 있어." });
    const parsed = JSON.parse(output);
    const validIds = new Set(books.map(b => b.id));
    const items = Array.isArray(parsed.items) ? parsed.items.filter(x =>
      validIds.has(String(x.id)) && categories.includes(x.category)
    ) : [];
    if (items.length !== books.length) {
      return res.status(502).json({ error: "일부 도서의 분류 결과가 누락됐어. 다시 시도해 줘." });
    }
    return res.status(200).json({ items });
  } catch (error) {
    console.error("Classification endpoint failed:", error && error.message ? error.message : "unknown error");
    return res.status(400).json({ error: "분류 요청을 처리하지 못했어. 다시 시도해 줘." });
  }
};
