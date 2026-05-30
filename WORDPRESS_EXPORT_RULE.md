# WordPress HTMLモード納品ルール

## 結論

納品形式は、通常のHTMLではなく **Gutenbergブロックコメント付きHTML** を基本にする。

WordPressのHTMLモードへ貼り付けた後も、見出し・段落・画像・表などがブロックとして認識されるため、先方が後から編集しやすい。

## 基本ルール

- 本文エリアだけを納品する。ヘッダー、フッター、パンくず、関連記事、CTAは含めない。
- `h2` は `wp:heading`、`h3` は `wp:heading {"level":3}` にする。
- 通常本文の `p` は `wp:paragraph` にする。
- 画像は `wp:image` にする。WordPressへ画像アップロード後、`src` は本番のメディアURLへ置換する。
- 表は `wp:html` ではなく `wp:table` にする。編集画面で表ブロックとして扱いやすくするため。
- 区切り線は `wp:separator` にする。
- 参考リンクなどのリストは `wp:list` にする。
- 独自装飾のボックスやインラインstyle付き段落だけ `wp:html` にする。

## 参考コードとの違い

先方からの参考コードは概ね正しいが、表を `wp:html` にしている点は最適ではない。

標準ブロックで表現できるものは標準ブロック化し、どうしても標準ブロックで表しにくい装飾だけHTMLブロックにするのが、コピペ後の編集性と崩れにくさのバランスがよい。

## 生成コマンド

全プレビューを変換する場合:

```powershell
node .\tools\export-wordpress-blocks.mjs
```

特定の記事だけ変換する場合:

```powershell
node .\tools\export-wordpress-blocks.mjs preview_2605-02.html
```

画像URLのベースを指定する場合:

```powershell
node .\tools\export-wordpress-blocks.mjs --image-base "https://evoltech-shiken.com/wp-content/uploads/2026/05/"
```

出力先:

```text
wordpress-export/
```

納品ファイルは `.txt` とする。中身はGutenbergブロックHTMLだが、先方がダブルクリックした場合でもブラウザにHTMLとして解釈されず、そのまま全選択コピーしやすいため。

## 画像の扱い

生成直後の画像URLは、既定では `__UPLOAD_BASE_URL__/images/...` になる。

本番反映時は、WordPressメディアに画像をアップロードし、生成HTML内の画像URLを実際のアップロードURLに置換する。画像IDが分かる場合は `wp:image` の属性に `id` を追加してもよい。
