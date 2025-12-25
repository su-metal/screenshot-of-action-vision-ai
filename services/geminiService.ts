import { GoogleGenAI, Type } from "@google/genai";
import { PredictionResult } from "../types";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not configured.");
}
const ai = new GoogleGenAI({ apiKey });

export const analyzeImageAction = async (
  base64Image: string
): Promise<PredictionResult> => {
  const model = "gemini-2.5-flash";

  const systemInstruction = `
あなたは高度な画像認識と情報抽出のエキスパートです。
送信された画像（スクリーンショット）から「画像内に書かれている事実」を抽出し、
ユーザーがすぐ実行できる1つのアクションとして、指定JSONで返してください。

重要方針
- 画像に無い情報は作らない（推測で補完しない）。不明な項目は空文字 "" にする。
- 複数の候補がある場合は「最も期限が近い」「最も行動が明確」な1件を優先する。
- 文章はユーザーがそのまま貼って使える自然文にする（過剰に長くしない）。

想定されるスクショ（このアプリの主用途）
1) 期限・締切（メール/チャット/オークション/決済期限）: Task
2) イベント告知（セミナー/予約/会議/学校予定）: Event
3) 店舗・場所（Google Maps/住所/行きたい店）: Place
4) 商品比較・購入検討（EC/スペック/価格）: Product
5) チャット依頼（返信が必要、やることが明確）: Task

カテゴリ定義（厳密に選ぶ）
- Event: 日時が確定していて「予定としてカレンダー登録」するのが自然なもの
- Task: 締切・返信・提出・判断・確認など「やるべきTODO」。期限があればcalendarStartに入れる
- Place: 住所/店名/施設名など「行く場所」が主役。mapQueryに入れる
- Product: 商品名/型番/ブランド/比較が主役。searchQueryに入れる

paramsの作り方（必須ルール）
- url: 画像内にURLがある場合は最優先で入れる（見つからなければ ""）
- TaskのcalendarStart:
  - 画像に「返信期限」「締切」「期限」「まで」等の日時があるなら、その日時をISO 8601で入れる
  - 日付だけで時刻が無い場合は "YYYY-MM-DDT09:00:00+09:00" を採用してよい
  - 期限が無いなら "" のまま
- EventのcalendarStart/calendarEnd:
  - 開始が分かるならcalendarStart
  - 終了が分からない場合はcalendarEndは ""（ここでは補完しない）
- calendarTitle: titleと同等か、少しだけ具体化（短く）
- calendarDetails: detailの要点を短くまとめる（URLがあれば末尾に含めてもよい）
- mapQuery: Placeの場合、店名 + 市区町村、または住所文字列
- searchQuery: Productの場合、ブランド + 型番 + キーワード（例: "EcoRing オークション 保留 交渉" などでも可）

PRODUCTの記述ルール（超重要）
- detail は「スクショから読める事実だけ」で構成する
  - 例: 価格、ブランド、型番、対応OS、配送、在庫、主要特徴（スクショに書かれている文言）
  - 読めない項目は書かない
- aiNotes は「AI補足」として書いてよい（推測/一般知識/購入時の注意/確認観点など）
  - ただし aiNotes 内では、スクショに書かれているかのように断定しない
  - 例: 「対応機種は公式ページで要確認」「用途がFPSなら重量も確認」など
  - 不要なら "" にする

出力要件
- JSONのみを返す（説明文は出さない）
- categoryは "Event" | "Product" | "Task" | "Place" のいずれか
- titleは短く（UIの見出し）
- detailは「次に何をすべきか」が分かるように、画像根拠に基づいて書く
- aiNotes は "" を許容する（PRODUCT以外は基本 ""）
- params はカテゴリに応じて必要項目だけ埋める（不要な項目は "" か省略ではなく ""）

PRODUCTのcalendarDetails出力フォーマット（UIにそのまま入れる）
- 画像から読み取れた項目だけを、次の順で改行区切りで記述する
  商品名: ...
  価格: ...（税込/税別が読めるなら含める）
  ブランド: ...
  型番/モデル: ...（読める場合）
  接続: ...（例 USB有線/無線 など、画像に明記がある場合）
  対応: ...（例 Windows/Mac など、画像に明記がある場合）
  主な特徴: ...（画像に書かれている文言のみ）
  配送: ...（例 翌日配送など、画像に明記がある場合）
  在庫: ...（例 残り◯点など、画像に明記がある場合）
  出荷元/販売元: ...（画像に明記がある場合）
- 読めない行は出力しない（無理に空行を作らない）
- モデル名や型番を推測する場合は aiNotes にのみ記載する
  - 必ず「候補として考えられる」「外観が類似している」などの表現を用いる
  - 断定表現は絶対に使わない
  - 候補は最大2〜3件までに制限する
  - 最後に「購入時は商品ページのモデル名や型番表記を確認してください」などの確認行動を添える


出力要件（厳守）
- JSONのみを返す（前後に説明文を付けない）
- category は "Event" | "Product" | "Task" | "Place"
- title は短く
- detail は短く（1〜3文）。事実と推測を混ぜない
- params.url は画像内にURL文字列が明確にある場合のみ
`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: "The category of the action (Event, Product, Task, Place)",
      },
      title: {
        type: Type.STRING,
        description: "A short, descriptive title for the action",
      },
      detail: {
        type: Type.STRING,
        description:
          "Detailed information about the detected item and suggested action",
      },
      aiNotes: {
        type: Type.STRING,
        description:
          "Optional AI notes. Use ONLY as supplemental info, not facts from the image.",
      },
      params: {
        type: Type.OBJECT,
        properties: {
          searchQuery: {
            type: Type.STRING,
            description: "Keyword for Google Search",
          },
          calendarTitle: { type: Type.STRING },
          calendarStart: {
            type: Type.STRING,
            description: "ISO 8601 formatted date/time string if available",
          },
          calendarEnd: { type: Type.STRING },
          calendarLocation: { type: Type.STRING },
          calendarDetails: { type: Type.STRING },
          mapQuery: {
            type: Type.STRING,
            description: "Location name or address for Google Maps",
          },
          url: {
            type: Type.STRING,
            description: "Relevant URL found in image",
          },
        },
        description: "Parameters extracted for specific tools",
      },
    },
    required: ["category", "title", "detail", "aiNotes", "params"],
  };

  const [mimeType, base64Data] = base64Image.split(",");
  const actualMimeType = mimeType.match(/:(.*?);/)?.[1] || "image/png";

  const result = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          {
            text: "画像内の事実だけを根拠に、最も実行しやすい1件のアクションをJSONで出力してください。不明項目は空文字にしてください。",
          },
          { inlineData: { data: base64Data, mimeType: actualMimeType } },
        ],
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  return JSON.parse(result.text || "{}");
};
