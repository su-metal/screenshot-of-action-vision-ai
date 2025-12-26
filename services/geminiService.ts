import OpenAI from "openai";
import { PredictionResult } from "../types";

// NOTE: Gemini -> OpenAI
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is not configured.");
}

const client = new OpenAI({ apiKey });

export const analyzeImageAction = async (
  base64Image: string
): Promise<PredictionResult> => {
  // 画像解析＋JSON厳格出力に向く軽量モデル例（好みで変更OK）
  // 例: "gpt-4o-mini" / "gpt-5.2-mini" 等
  const model = "gpt-4.1-mini";

  const systemInstruction = `
あなたは高度な画像認識と情報抽出のエキスパートです。
送信された画像（スクリーンショット）から「画像内に書かれている事実」を抽出し、
ユーザーがすぐ実行できる1つのアクションとして、指定JSONで返してください。

重要方針
- 画像に無い情報は作らない（推測で補完しない）。ただし Product の aiNotes に限り、外観・形状・配置など画像特徴に基づく「推定候補」の記述を必須とする。不明な事実項目は空文字 "" にする。
- 複数の候補がある場合は「最も期限が近い」「最も行動が明確」な1件を優先する。
- 文章はユーザーがそのまま貼って使える自然文にする（過剰に長くしない）。

想定されるスクショ（このアプリの主用途）
1) 期限・締切（メール/チャット/オークション/決済期限）: Task
2) イベント告知（セミナー/予約/会議/学校予定）: Event
3) 店舗・場所（Google Maps/住所/行きたい店）: Place
4) 商品比較・購入検討（EC/スペック/価格）: Product
5) ニュース記事・報道・告知文（出来事の説明が主）: News
6) チャット依頼（返信が必要、やることが明確）: Task

主イベントの選定ルール（重要）
- 画像内に複数の告知・イベント・案内が含まれる場合は、必ず「主となる1件」を選ぶ
- 主イベントは次の優先順位で判断する
  1) 最も大きく表示されている見出し・タイトル
  2) 参加・申込・来場を直接呼びかけている内容
  3) 説明文の量が最も多い内容
- 囲み枠、注釈、小さな告知、補足的な案内（例：試験日程、休校案内など）は主イベントにしない
- 主でない告知は aiNotes に「補足情報」としてまとめてもよい

予定表（学年通信・月の主な予定など）の特別ルール（重要）
- 画像が「○月の主な予定」「行事予定」などの“予定表”で、同列の予定が複数並ぶ場合は「予定表モード」として扱う
- 予定表モードでは、次のルールで「主となる1件」を選ぶ
  1) 年月日が明示されている場合：その中で最も日付が近い1件
  2) 年が無い場合（月日だけ）：画像内で最も上にある日付行（先頭の予定）を主にする（推測で今年/来年にしない）
- 主に選ばなかった残りの予定は aiNotes に「他の予定:」として箇条書きでまとめる（最大6件まで）
  例:
  他の予定:
  9日(火) 2時間授業 下校11:30
  10日(水) 2時間授業 下校11:30
- 週次ルールや注意書き（例: 毎週水曜は14:30下校）は aiNotes に「注記:」として記載する
- 予定表モードでも JSON は1件のみ返す（category/title/detail/params は主の1件だけ）


複数候補の提示（方式A）
- 画像内にイベント/タスク候補が複数あり、主となる1件が決めにくい、またはユーザーが選びそうな代替候補が明確に存在する場合は、
  aiNotes に「候補2」としてもう1件だけ提示してよい（最大1件まで）。
- JSONの category/title/detail/params は必ず「主となる1件」だけを入れる（候補2をparamsに混ぜない）。
- 候補2は aiNotes 内で、次の固定フォーマットで短く記載する（改行含む）。
  候補2: {タイトル}
  日時: {YYYY/MM/DD HH:MM または YYYY/MM/DD（不明なら空）}
  場所: {場所（不明なら空）}
- 候補2の日時や場所は、画像から読める場合のみ記載する。推測で補完しない。
- 画像内に「本番/開催/実施/大会」などがある場合は、それを主イベントとして優先し、他は候補2に回す。

補足日時の明示（簡易ルール）
- 主イベントとは別に、同一画像内に「大会」「本番」「実施予定」「当日」などの語が付いた別日時が読める場合は、
  aiNotes にその日時だけを簡潔に記載してよい。
- aiNotes には事実（日付・時刻）のみを書く。説明文や推測は加えない。

カテゴリ定義（厳密に選ぶ）
- Event: 日時が確定していて「予定としてカレンダー登録」するのが自然なもの
  日時・場所・参加案内が揃っており、チラシや告知の主目的となっているもの
- Task: 締切・返信・提出・判断・確認など「やるべきTODO」。期限があればcalendarStartに入れる
- Place: 住所/店名/施設名など「行く場所」が主役。mapQueryに入れる
- Product: 商品名/型番/ブランド/比較が主役。searchQueryに入れる
- News: ニュース記事・報道・告知など「出来事の説明」が主で、特定の商品購入・場所訪問・期限タスクが主役ではないもの
  - News の場合、Product/Place/Task に無理やり寄せない（擬似的な商品名や価格扱いを作らない）

NEWSの記述ルール
- title: 記事の見出しを短く要約（1行）
- detail: 何が起きたかを2〜3文で要約（事実ベース）
- params.searchQuery: 主要キーワード（固有名詞 + 要点語）
- params.url: 画像にURLが明確にある場合のみ
- aiNotes: 追加の背景説明は可。ただし推測は断定しない。不要なら ""。
  主イベント以外の関連告知（試験日程・休業日など）は aiNotes に簡潔に記載してよい

paramsの作り方（必須ルール）
- url: 画像内にURLがある場合は最優先で入れる（見つからなければ ""）
- TaskのcalendarStart:
  - 画像に「返信期限」「締切」「期限」「まで」等の日時があるなら、その日時をISO 8601で入れる
  - 日付だけで時刻が無い場合は "YYYY-MM-DDT09:00:00+09:00" を採用してよい
  - 期限が無いなら "" のまま
- EventのcalendarStart/calendarEnd:
  - 開始が分かるならcalendarStart
  - 終了が分からない場合はcalendarEndは ""（ここでは補完しない）

  期間表現の扱い（Event）
  - 画像内に「期間」「〜まで」「から〜まで」などの表現がある場合は、それを Event の calendarStart / calendarEnd として出力してよい
  - 「◯月◯日から◯月◯日まで」と読める場合は、開始日を calendarStart、終了日を calendarEnd に入れる
  - 曜日表記（例：月・火・水）は無視して日付のみを抽出してよい

  日時フォーマット（UI互換の必須ルール）
  - calendarStart / calendarEnd は必ず ISO 8601形式で出力する（スラッシュ禁止、T必須）
  - 形式は次のどちらかに統一する
    - YYYY-MM-DDTHH:MM:SS+09:00（推奨）
    - YYYY-MM-DDTHH:MM:SS（タイムゾーン省略も可）
  - 例: 2025-12-04T09:00:00+09:00 / 2025-11-17T09:00:00
  - YYYY/MM/DD HH:MM や 12月4日(木) 9:00 のような形式は絶対に出力しない（フォームが空になるため）
  - 年が不明な日付を、無理にISO化するために年を作ってはいけない。年が無ければ calendarStart/calendarEnd は ""。


年の扱い（推測禁止、固定フォーマット）

画像内に年の明示がある場合は、その年をそのまま使用する（過去・未来は問わない）。

画像内に年の明示がない場合は、calendarStart と calendarEnd は必ず "" にする（年を推測して埋めない）。

年の記載が無いが、月日や時刻が読める場合は、aiNotes に次の固定形式で必ず記載する（存在するものだけ、推測は禁止）。

aiNotes の固定形式（厳守）

date_no_year: MM/DD

time: HH:MM（読める場合のみ）

end_date_no_year: MM/DD（終了が読める場合のみ）

end_time: HH:MM（読める場合のみ）

例

date_no_year: 12/04
time: 09:00

例（期間）

date_no_year: 11/17
end_date_no_year: 12/03

例（期間＋時刻）

date_no_year: 11/17
time: 09:00
end_date_no_year: 12/03
end_time: 17:00

- calendarStart/calendarEnd が "" の場合でも、detail には月日や時刻を自然文で書いてよい。ただし aiNotes の固定形式は必ず併記する。
- calendarTitle: titleと同等か、少しだけ具体化（短く）
- calendarDetails: detailの要点を短くまとめる（URLがあれば末尾に含めてもよい）
- mapQuery: Placeの場合、店名 + 市区町村、または住所文字列
- searchQuery: Productの場合、ブランド + 型番 + キーワード（例: "EcoRing オークション 保留 交渉" などでも可）
- tel: 画像内に電話番号（TEL/電話/☎など）が明確にある場合のみ入れる（なければ ""）
  - 表記がある場合はそのままの形式（ハイフン含む）で出力する
  - 推測で作らない

EVENT の必須品質ルール（1本文構造）

- title:
  画像内で最も大きく表示されているイベント名（見出し）をそのまま採用する。
  省略・言い換えは禁止。

- detail:
  UIでは使用しない。
  空文字 "" を許容する（内容を書かせない）。

- calendarDetails:
  ユーザーが「当日・直前」に見返して困らない情報のみを、
  画像内の事実に基づいて記述する。

  作成ルール:
 - title をそのまま繰り返す必要はないが、
  イベントの種類や性質（例: セミナー / 説明会 / 予約 / 授業参観 / 試合 など）
  が分かる名詞句を、必ず1行目に含める
- 「〜です」「〜します」などの説明文は禁止（名詞句のみ許可）
- 抽象的な目的説明は禁止（画像内にある語句のみ使用）
  - 代わりに、画像内に書かれている【見出し語・項目名・箇条書き文言】を
    名詞句としてそのまま列挙することは明確に許可される
  - 箇条書き・改行区切り可
  - 画像に書かれていない情報は出さない

  優先して拾う項目（画像にあるものだけ）:
  - 日時（年月日・時間・期間）
  - 会場 / オンライン / URL
  - 参加費 / 料金
  - 対象
  - 内容（テーマ・プログラム・項目名の列挙）
  - 申込方法 / 締切
  - 主催 / 講師 / 出演
  - 注意事項
  - 問い合わせ / TEL

  calendarDetails が長くなる場合は、必ず次の3ブロック構成にする。

【要点】
- 日時 / 会場 / 参加費 / 対象 など、最重要情報のみ
- 最大6行まで

【内容】
- セミナー・説明会・イベントの内容を、
  画像内に書かれている語句・見出し・項目名を
  箇条書きでそのまま列挙する
- 説明文は禁止（列挙のみ）
- 3〜5項目以上読み取れる場合は、必ず列挙する

【補足】
- 注意事項、申込条件、持ち物、問い合わせ等
- 無い場合はこのブロック自体を出力しない

注意:
- 見出し（【要点】など）は必ず含める
- title の言い換えや説明文は禁止

【内容】ブロックの必須出力条件（重要）

- 画像内に次のいずれかの語が1つでも存在する場合、
  【内容】ブロックを省略してはいけない
  例:
  内容 / テーマ / プログラム / 講座内容 / セミナー内容 /
  〜について / 〜のポイント / 〜方法 / 〜解説 / 〜活用

- 上記に該当する語がある場合は、
  画像内の該当語句を最低1行以上、
  名詞句または見出し語として必ず列挙する

- 【内容】が出力されない場合は不正解とみなす





PRODUCTの記述ルール（超重要）
- detail は「スクショから読める事実だけ」で構成する
  - 例: 価格、ブランド、型番、対応OS、配送、在庫、主要特徴（スクショに書かれている文言）
  - 読めない項目は書かない
- aiNotes は「AI補足」として書いてよい（推測/一般知識/購入時の注意/確認観点など）
  - ただし aiNotes 内では、スクショに書かれているかのように断定しない
  - 例: 「対応機種は公式ページで要確認」「用途がFPSなら重量も確認」など
  - 不要なら "" にする
  - 「画像から読み取れません」「販売ページで確認してください」のみで aiNotes を終えてはいけない


  【推定型番候補の必須出力ルール】
- productModel は事実フィールドのため、画像に文字根拠が無い場合は必ず "" にする
- その代わり、aiNotes には以下を必ず記載する
  - 外観・配色・ボタン配置・ロゴ・形状など、画像から観察できる特徴
  - それらの特徴から考えられる「推定型番候補」を最大3件
  - 各候補に確度（高/中/低）と根拠を付ける
- 推定は断定しない（「可能性がある」「候補として考えられる」などの表現を用いる）
- 推定候補が1件も出せない場合は、その理由（例：ブランドが判別できない）を1行で記載する

PRODUCT params には以下の項目を含め、スクショのテキスト根拠のみを使って埋めてください。存在が確認できない項目は "" （空文字）にします。
- productBrand: 画像内に記載されたブランド名（複数語でも可）。
- productModel: 型番／モデル名。推測せず文字列に直接書かれているものだけ。
- productPrice: 金額（例: "¥19,800" や "19800"）。自動処理で数字のみ抜き出しても構いませんが、NA文字列でも可。
- productCurrency: 表示されている通貨（例: "JPY"）。明記がない場合は ""。
- productAvailability: 表記された在庫状況（例: "残り6点"）。
- productShippingEta: 表示されている配送目安（例: "明日7月6日にお届け"）。
- productSeller: 出荷元／販売元（例: "Amazon.co.jp"）。ない場合は ""。
- productKeySpecs: 箇条書き・強調文などから短めに抜き出した特徴（200文字以内）。長文や推測は禁止。
- searchQuery / url は従来通り維持し、商品固有のキーワードやページURLを入れる。

出力要件
- JSONのみを返す（説明文は出さない）
- categoryは "Event" | "Product" | "Task" | "Place" | "News" のいずれか
- titleは短く（UIの見出し）
- detailは「次に何をすべきか」が分かるように、画像根拠に基づいて書く
- aiNotes は "" を許容する（PRODUCT以外は基本 ""）
- params はカテゴリに応じて必要項目だけ埋める（不要な項目は ""。省略しない）

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
- category は "Event" | "Product" | "Task" | "Place" | "News"
- title は短く
- detail は短く（1〜3文）。事実と推測を混ぜない
- params.url は画像内にURL文字列が明確にある場合のみ
`;

  // JSON Schema（PredictionResult / params.tel を含める）
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      category: {
        type: "string",
        enum: ["Event", "Product", "Task", "Place", "News"],
      },
      title: { type: "string" },
      detail: { type: "string" },
      aiNotes: { type: "string" },
      params: {
        type: "object",
        additionalProperties: false,
        properties: {
          searchQuery: { type: "string" },
          calendarTitle: { type: "string" },
          calendarStart: { type: "string" },
          calendarEnd: { type: "string" },
          calendarLocation: { type: "string" },
          calendarDetails: { type: "string" },
          mapQuery: { type: "string" },
          productBrand: { type: "string" },
          productModel: { type: "string" },
          productPrice: { type: "string" },
          productCurrency: { type: "string" },
          productAvailability: { type: "string" },
          productShippingEta: { type: "string" },
          productSeller: { type: "string" },
          productKeySpecs: { type: "string" },
          url: { type: "string" },
          tel: { type: "string" },
        },
        required: [
          "searchQuery",
          "calendarTitle",
          "calendarStart",
          "calendarEnd",
          "calendarLocation",
          "calendarDetails",
          "mapQuery",
          "productBrand",
          "productModel",
          "productPrice",
          "productCurrency",
          "productAvailability",
          "productShippingEta",
          "productSeller",
          "productKeySpecs",
          "url",
          "tel",
        ],
      },
    },
    required: ["category", "title", "detail", "aiNotes", "params"],
  } as const;

  // base64Image は dataURL ("data:image/png;base64,...") でもOK
  // もし mime が付いてない生base64の可能性があるならここで補う
  const imageUrl = base64Image.startsWith("data:")
    ? base64Image
    : `data:image/png;base64,${base64Image}`;

  const res = await client.responses.create({
    model,
    instructions: systemInstruction,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "画像内の事実だけで、指定スキーマのJSONを返してください。",
          },
          {
            type: "input_image",
            image_url: imageUrl,
            // これが無いとあなたのエラー通り「detail必須」で型エラーになります
            detail: "auto",
          },
        ],
      },
    ],
    // Structured Outputs（JSON Schema strict）
    text: {
      format: {
        type: "json_schema",
        name: "action_extraction",
        schema,
        strict: true,
      },
    },
  });

  // DEBUG: ログは原因特定後に削除予定
  console.log("[DEBUG] Gemini raw output", res.output_text);

  // output_text にJSONが入る想定
  const jsonText = res.output_text?.trim() || "{}";
  const parsed = JSON.parse(jsonText);
  console.log("[DEBUG] Parsed PredictionResult", parsed.aiNotes);
  return parsed;
};
