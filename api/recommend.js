// Vercel serverless function: keeps OPENAI_API_KEY on the server.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 요청만 지원해." });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "서버에 API 키가 설정되지 않았어. Vercel 환경변수를 확인해 줘." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 1500) : "";
    const ageLabel = typeof body.ageLabel === "string" ? body.ageLabel.slice(0, 40) : "선택 연령";
    const books = Array.isArray(body.books) ? body.books.slice(0, 200).map(b => ({
      title: String(b.title || "").slice(0, 160),
      author: String(b.author || "").slice(0, 100),
      publisher: String(b.publisher || "").slice(0, 100),
      year: String(b.year || "").slice(0, 12),
      category: String(b.category || "").slice(0, 60),
      isbn: String(b.isbn || "").slice(0, 20)
    })).filter(b => b.title) : [];

    if (question.length < 8) return res.status(400).json({ error: "관심사를 8자 이상 입력해 줘." });
    if (!books.length) return res.status(400).json({ error: "추천할 도서 목록이 없어." });

    const instructions = [
      "너는 청소년 독자를 위한 도서 추천 도우미다. 한국어로 친절하고 구체적으로 답한다.",
      "반드시 제공된 도서 목록에 실제로 있는 책만 추천한다. 목록에 없는 제목, 저자, 출판 정보를 만들지 않는다.",
      "추천 도서 3~5권을 제목·저자와 함께 제시하고, 각 책이 사용자의 관심사와 어떻게 연결되는지 설명한다.",
      "책의 상세 내용이 확실하지 않으면 줄거리나 핵심 내용을 단정하지 말고, 목록의 분류와 서지 정보에 근거한 추천임을 밝힌다.",
      "실제 책에서 확인하지 않은 문장을 직접 인용하거나 따옴표로 책의 구절인 것처럼 만들지 않는다.",
      "끝에 추천 기준이 선택 연령대의 국립중앙도서관 대출 목록이라는 점과 한계를 짧게 설명한다.",
      "사용자가 개인정보를 입력했더라도 답변에서 되풀이하지 않는다."
    ].join("\n");
    const input = "선택 연령대: " + ageLabel + "\n사용자의 관심사: " + question +
      "\n추천 가능한 도서 목록(JSON):\n" + JSON.stringify(books);

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions,
        input,
        max_output_tokens: 900,
        store: false
      })
    });
    const payload = await upstream.json();
    if (!upstream.ok) {
      console.error("OpenAI API error status:", upstream.status);
      return res.status(502).json({ error: "AI 응답을 가져오지 못했어. 잠시 뒤 다시 시도해 줘." });
    }
    const text = typeof payload.output_text === "string" ? payload.output_text :
      (payload.output || []).flatMap(item => item.content || []).filter(c => c.type === "output_text").map(c => c.text).join("\n");
    if (!text) return res.status(502).json({ error: "AI 응답이 비어 있어. 다시 시도해 줘." });
    return res.status(200).json({ result: text });
  } catch (error) {
    console.error("Recommendation endpoint failed:", error && error.message ? error.message : "unknown error");
    return res.status(400).json({ error: "요청을 처리하지 못했어. 입력을 확인하고 다시 시도해 줘." });
  }
};
